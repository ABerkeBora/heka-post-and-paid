// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PostAndPaidEscrow} from "./PostAndPaidEscrow.sol";
import {AirnodeV2Attestation} from "./AirnodeV2Attestation.sol";
import {ProjectedJson} from "./ProjectedJson.sol";
import {TwitterTimestamp} from "./TwitterTimestamp.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {LibString} from "solady/utils/LibString.sol";

/// @notice Checks a post before brand collateral is committed. No fee or collateral is held here.
/// @dev This deployed helper keeps factory runtime under EIP-170 while reusing the V1 attestation/parser libraries.
contract PostAndPaidIntakeVerifier {
    address public immutable airnode;

    struct Target {
        string postId;
        string authorId;
        string requiredText;
        uint64 postedAfter;
        uint64 postedBefore;
        uint64 maxResponseAge;
    }

    error InvalidPostId();
    error FutureResponse();
    error StaleResponse();
    error WrongPost();
    error WrongAuthor();
    error MissingChallenge();
    error PostOutsideWindow();
    error PostAfterSnapshot();

    constructor(address airnode_) {
        airnode = airnode_;
    }

    function deriveRequestHash(string memory postId) public pure returns (bytes32) {
        if (!_numericId(postId)) revert InvalidPostId();
        return keccak256(
            bytes(
                string.concat(
                    '["tweetsByIds",[["tweet_ids","',
                    postId,
                    '"]],[["authorId","/tweets/0/author/id"],["createdAt","/tweets/0/createdAt"],',
                    '["postId","/tweets/0/id"],["text","/tweets/0/text"]]]'
                )
            )
        );
    }

    function verify(Target calldata target, uint256 timestamp, bytes calldata data, bytes calldata signature)
        external
        view
        returns (bytes32)
    {
        AirnodeV2Attestation.verify(airnode, deriveRequestHash(target.postId), timestamp, data, signature);
        if (timestamp > block.timestamp) revert FutureResponse();
        if (block.timestamp - timestamp > target.maxResponseAge) revert StaleResponse();
        if (!LibString.eq(ProjectedJson.readString(data, "postId"), target.postId)) revert WrongPost();
        if (!LibString.eq(ProjectedJson.readString(data, "authorId"), target.authorId)) revert WrongAuthor();
        if (LibString.indexOf(ProjectedJson.readString(data, "text"), target.requiredText) == LibString.NOT_FOUND) {
            revert MissingChallenge();
        }
        uint256 postedAt = TwitterTimestamp.parse(ProjectedJson.readString(data, "createdAt"));
        if (postedAt < target.postedAfter || postedAt > target.postedBefore) revert PostOutsideWindow();
        if (postedAt > timestamp) revert PostAfterSnapshot();
        return keccak256(data);
    }

    function _numericId(string memory value) private pure returns (bool) {
        bytes memory chars = bytes(value);
        if (chars.length == 0 || chars.length > 24 || chars[0] == "0") return false;
        for (uint256 i; i < chars.length; ++i) {
            if (chars[i] < "0" || chars[i] > "9") return false;
        }
        return true;
    }
}

/// @notice Binds creator EOA consent and authenticated post intake before funding a V1 payout escrow.
/// @dev A wallet signature alone is not social-account ownership. Both wallet consent and signed social data are required.
///      Domain is this factory, version 2 and Base Sepolia only. This contract does not implement ERC-1271.
contract PostAndPaidConsentFactory {
    struct Terms {
        bytes32 agreementId;
        address brand;
        address creator;
        string authorId;
        string postId;
        bytes32 nonce;
        address asset;
        uint256 feeWei;
        string requiredText;
        uint64 postedAfter;
        uint64 postedBefore;
        uint64 claimDeadline;
        uint64 consentDeadline;
        uint64 maxResponseAge;
    }

    struct Agreement {
        address escrow;
        address brand;
        address creator;
        uint256 feeWei;
        bytes32 consentHash;
    }

    bytes32 public constant CONSENT_TYPEHASH = keccak256(
        "CreatorConsent(bytes32 agreementId,address brand,address creator,string authorId,string postId,bytes32 nonce,address asset,uint256 feeWei,string requiredText,uint64 postedAfter,uint64 postedBefore,uint64 claimDeadline,uint64 consentDeadline,uint64 maxResponseAge)"
    );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    uint256 public constant CHAIN_ID = 84532;
    address public immutable airnode;
    PostAndPaidIntakeVerifier public immutable intakeVerifier;
    mapping(bytes32 => bool) public usedConsent;
    mapping(address => mapping(bytes32 => bool)) public usedNonce;
    mapping(bytes32 => Agreement) public agreements;
    mapping(address => bool) public isEscrow;

    error WrongChain();
    error InvalidTerms();
    error ConsentExpired();
    error ConsentAlreadyUsed();
    error AgreementAlreadyUsed();
    error NonceAlreadyUsed();
    error WrongCreator();
    error WrongBrand();
    error WrongFunding();
    error UnknownAgreement();
    error UnexpectedRefund();
    error RefundForwardFailed();

    event AgreementCreated(
        bytes32 indexed agreementId,
        address indexed escrow,
        address indexed creator,
        address brand,
        bytes32 consentHash,
        bytes32 requestHash,
        uint256 feeWei
    );
    event AgreementRefunded(bytes32 indexed agreementId, address indexed brand, uint256 feeWei);

    constructor(address trustedAirnode) {
        if (block.chainid != CHAIN_ID) revert WrongChain();
        if (trustedAirnode == address(0)) revert InvalidTerms();
        airnode = trustedAirnode;
        intakeVerifier = new PostAndPaidIntakeVerifier(trustedAirnode);
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("Post and Paid"), keccak256("2"), block.chainid, address(this))
        );
    }

    function termsStructHash(Terms memory terms) public pure returns (bytes32) {
        // Fixed-width words are exactly EIP-712's abi.encode(typehash, ...fields), without a dynamic tuple offset.
        bytes32[15] memory words;
        words[0] = CONSENT_TYPEHASH;
        words[1] = terms.agreementId;
        words[2] = bytes32(uint256(uint160(terms.brand)));
        words[3] = bytes32(uint256(uint160(terms.creator)));
        words[4] = keccak256(bytes(terms.authorId));
        words[5] = keccak256(bytes(terms.postId));
        words[6] = terms.nonce;
        words[7] = bytes32(uint256(uint160(terms.asset)));
        words[8] = bytes32(terms.feeWei);
        words[9] = keccak256(bytes(terms.requiredText));
        words[10] = bytes32(uint256(terms.postedAfter));
        words[11] = bytes32(uint256(terms.postedBefore));
        words[12] = bytes32(uint256(terms.claimDeadline));
        words[13] = bytes32(uint256(terms.consentDeadline));
        words[14] = bytes32(uint256(terms.maxResponseAge));
        return keccak256(abi.encode(words));
    }

    function hashTerms(Terms memory terms) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), termsStructHash(terms)));
    }

    function challengeFor(bytes32 nonce, address creator) public pure returns (string memory) {
        return string.concat(
            "[pap2:", LibString.toHexStringNoPrefix(uint256(nonce), 32), ":", LibString.toHexString(creator), "]"
        );
    }

    function deriveRequestHash(string memory postId) public view returns (bytes32) {
        return intakeVerifier.deriveRequestHash(postId);
    }

    function verifyConsent(Terms memory terms, bytes calldata creatorSignature) public view returns (bytes32 digest) {
        if (block.chainid != CHAIN_ID) revert WrongChain();
        _validateTerms(terms);
        if (block.timestamp >= terms.consentDeadline) revert ConsentExpired();
        digest = hashTerms(terms);
        if (usedConsent[digest]) revert ConsentAlreadyUsed();
        if (agreements[terms.agreementId].escrow != address(0)) revert AgreementAlreadyUsed();
        if (usedNonce[terms.creator][terms.nonce]) revert NonceAlreadyUsed();
        if (ECDSA.recover(digest, creatorSignature) != terms.creator) revert WrongCreator();
    }

    function verifyIntake(Terms memory terms, uint256 timestamp, bytes calldata data, bytes calldata airnodeSignature)
        public
        view
        returns (bytes32)
    {
        if (block.chainid != CHAIN_ID) revert WrongChain();
        _validateTerms(terms);
        return intakeVerifier.verify(
            PostAndPaidIntakeVerifier.Target(
                terms.postId,
                terms.authorId,
                terms.requiredText,
                terms.postedAfter,
                terms.postedBefore,
                terms.maxResponseAge
            ),
            timestamp,
            data,
            airnodeSignature
        );
    }

    function fundAgreement(
        Terms memory terms,
        bytes calldata creatorSignature,
        uint256 timestamp,
        bytes calldata data,
        bytes calldata airnodeSignature
    ) external payable returns (address escrow) {
        if (msg.sender != terms.brand) revert WrongBrand();
        if (msg.value != terms.feeWei) revert WrongFunding();
        bytes32 digest = verifyConsent(terms, creatorSignature);
        verifyIntake(terms, timestamp, data, airnodeSignature);
        // All consent and oracle checks precede deployment/collateral commitment. Reverts roll these effects back.
        usedConsent[digest] = true;
        usedNonce[terms.creator][terms.nonce] = true;
        return _deployChild(terms, digest);
    }

    function _deployChild(Terms memory terms, bytes32 digest) private returns (address escrow) {
        PostAndPaidEscrow child = new PostAndPaidEscrow{value: terms.feeWei}(
            PostAndPaidEscrow.Config({
                creator: payable(terms.creator),
                airnode: airnode,
                postId: terms.postId,
                authorId: terms.authorId,
                campaignCode: terms.requiredText,
                postedAfter: terms.postedAfter,
                postedBefore: terms.postedBefore,
                claimDeadline: terms.claimDeadline,
                maxResponseAge: terms.maxResponseAge
            })
        );
        escrow = address(child);
        agreements[terms.agreementId] = Agreement(escrow, terms.brand, terms.creator, terms.feeWei, digest);
        isEscrow[escrow] = true;
        emit AgreementCreated(
            terms.agreementId, escrow, terms.creator, terms.brand, digest, child.requestHash(), terms.feeWei
        );
    }

    /// @notice The original brand may recover an expired unpaid child escrow. No administrator can redirect it.
    function refundAgreement(bytes32 agreementId) external {
        Agreement memory agreement = agreements[agreementId];
        if (agreement.escrow == address(0)) revert UnknownAgreement();
        if (msg.sender != agreement.brand) revert WrongBrand();
        PostAndPaidEscrow child = PostAndPaidEscrow(agreement.escrow);
        child.refund();
        // Send exactly this child's pinned collateral, not the factory's whole balance (which may include forced ETH).
        (bool ok,) = payable(agreement.brand).call{value: agreement.feeWei}("");
        if (!ok) revert RefundForwardFailed();
        emit AgreementRefunded(agreementId, agreement.brand, agreement.feeWei);
    }

    receive() external payable {
        if (!isEscrow[msg.sender]) revert UnexpectedRefund();
    }

    function _validateTerms(Terms memory terms) private view {
        if (
            terms.agreementId == bytes32(0) || terms.nonce == bytes32(0) || terms.brand == address(0)
                || terms.creator == address(0) || terms.creator == terms.brand || terms.creator == address(this)
                || terms.asset != address(0) || terms.feeWei == 0 || !_numericId(terms.authorId)
                || !_numericId(terms.postId)
                || !LibString.eq(terms.requiredText, challengeFor(terms.nonce, terms.creator))
                || terms.postedAfter > terms.postedBefore || terms.postedBefore > terms.claimDeadline
                || terms.claimDeadline <= block.timestamp || terms.consentDeadline > terms.claimDeadline
                || terms.maxResponseAge == 0 || terms.maxResponseAge > 1 days
        ) revert InvalidTerms();
    }

    function _numericId(string memory value) private pure returns (bool) {
        bytes memory chars = bytes(value);
        if (chars.length == 0 || chars.length > 24 || chars[0] == "0") return false;
        for (uint256 i; i < chars.length; ++i) {
            if (chars[i] < "0" || chars[i] > "9") return false;
        }
        return true;
    }
}
