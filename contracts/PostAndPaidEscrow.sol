// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AirnodeV2Attestation} from "./AirnodeV2Attestation.sol";
import {ProjectedJson} from "./ProjectedJson.sol";
import {TwitterTimestamp} from "./TwitterTimestamp.sol";
import {LibString} from "solady/utils/LibString.sol";

/// @notice A single immutable agreement, funded with native currency at creation.
/// @dev Airnode signatures attest to a source snapshot, not continuous publication or campaign quality.
contract PostAndPaidEscrow {
    enum State { Active, Paid, Refunded }

    struct Config {
        address payable creator;
        address airnode;
        string postId;
        string authorId;
        string campaignCode;
        uint64 postedAfter;
        uint64 postedBefore;
        uint64 claimDeadline;
        uint64 maxResponseAge;
    }

    error InvalidAgreement();
    error AlreadySettled();
    error DeadlinePassed();
    error ResponseTooOld();
    error ResponseBeforeFunding();
    error ResponseFromFuture();
    error WrongPost();
    error WrongAuthor();
    error CampaignCodeMissing();
    error PostOutsideWindow();
    error PostAfterSnapshot();
    error NotBrand();
    error RefundTooEarly();
    error PaymentFailed();

    address payable public immutable brand;
    address payable public immutable creator;
    address public immutable airnode;
    uint256 public immutable payout;
    bytes32 public immutable requestHash;
    uint256 public immutable fundedAt;
    uint64 public immutable postedAfter;
    uint64 public immutable postedBefore;
    uint64 public immutable claimDeadline;
    uint64 public immutable maxResponseAge;
    string public postId;
    string public authorId;
    string public campaignCode;
    State public state;

    event AgreementFunded(address indexed brand, address indexed creator, uint256 amount, bytes32 requestHash);
    event CreatorPaid(address indexed creator, uint256 amount, uint256 snapshotTimestamp, bytes32 dataHash);
    event BrandRefunded(address indexed brand, uint256 amount);

    constructor(Config memory config) payable {
        if (
            msg.value == 0 || config.creator == address(0) || config.creator == msg.sender
                || config.airnode == address(0) || !_numericId(config.postId) || !_numericId(config.authorId)
                || bytes(config.campaignCode).length == 0 || bytes(config.campaignCode).length > 128
                || config.postedAfter > config.postedBefore || config.postedBefore > config.claimDeadline
                || config.claimDeadline <= block.timestamp || config.maxResponseAge == 0
                || config.maxResponseAge > 1 days
        ) revert InvalidAgreement();
        brand = payable(msg.sender);
        creator = config.creator;
        airnode = config.airnode;
        payout = msg.value;
        fundedAt = block.timestamp;
        postedAfter = config.postedAfter;
        postedBefore = config.postedBefore;
        claimDeadline = config.claimDeadline;
        maxResponseAge = config.maxResponseAge;
        postId = config.postId;
        authorId = config.authorId;
        campaignCode = config.campaignCode;
        requestHash = deriveRequestHash(config.postId);
        emit AgreementFunded(msg.sender, config.creator, msg.value, requestHash);
    }

    /// @notice Derives the POST / request hash from a numeric post ID and the fixed four-field projection.
    /// @dev A caller cannot choose another operation, parameter type, or projection.
    function deriveRequestHash(string memory numericPostId) public pure returns (bytes32) {
        if (!_numericId(numericPostId)) revert InvalidAgreement();
        return keccak256(bytes(string.concat(
            '["tweetsByIds",[["tweet_ids","', numericPostId,
            '"]],[["authorId","/tweets/0/author/id"],["createdAt","/tweets/0/createdAt"],',
            '["postId","/tweets/0/id"],["text","/tweets/0/text"]]]'
        )));
    }

    /// @notice Anyone, including the delegated procurement agent, can deliver the original signed response.
    /// @dev Signature verification always uses the stored trust root and derived request hash.
    function submitResponse(uint256 timestamp, bytes calldata data, bytes calldata signature) external {
        if (state != State.Active) revert AlreadySettled();
        if (block.timestamp > claimDeadline) revert DeadlinePassed();
        AirnodeV2Attestation.verify(airnode, requestHash, timestamp, data, signature);
        if (timestamp > block.timestamp) revert ResponseFromFuture();
        if (timestamp < fundedAt) revert ResponseBeforeFunding();
        if (block.timestamp - timestamp > maxResponseAge) revert ResponseTooOld();
        if (!LibString.eq(ProjectedJson.readString(data, "postId"), postId)) revert WrongPost();
        if (!LibString.eq(ProjectedJson.readString(data, "authorId"), authorId)) revert WrongAuthor();
        string memory text = ProjectedJson.readString(data, "text");
        if (LibString.indexOf(text, campaignCode) == LibString.NOT_FOUND) revert CampaignCodeMissing();
        uint256 postedAt = TwitterTimestamp.parse(ProjectedJson.readString(data, "createdAt"));
        if (postedAt < postedAfter || postedAt > postedBefore) revert PostOutsideWindow();
        if (postedAt > timestamp) revert PostAfterSnapshot();

        // Effects precede interaction: even a creator contract cannot claim the same escrow twice.
        state = State.Paid;
        emit CreatorPaid(creator, payout, timestamp, keccak256(data));
        (bool ok,) = creator.call{value: payout}("");
        if (!ok) revert PaymentFailed();
    }

    /// @notice Unpaid collateral returns to its original funder after the pinned deadline.
    function refund() external {
        if (msg.sender != brand) revert NotBrand();
        if (state != State.Active) revert AlreadySettled();
        if (block.timestamp <= claimDeadline) revert RefundTooEarly();
        state = State.Refunded;
        emit BrandRefunded(brand, payout);
        (bool ok,) = brand.call{value: payout}("");
        if (!ok) revert PaymentFailed();
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
