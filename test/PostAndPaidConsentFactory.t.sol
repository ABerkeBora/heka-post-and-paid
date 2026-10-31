// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PostAndPaidConsentFactory, PostAndPaidIntakeVerifier} from "../contracts/PostAndPaidConsentFactory.sol";
import {PostAndPaidEscrow} from "../contracts/PostAndPaidEscrow.sol";
import {AirnodeV2Attestation} from "../contracts/AirnodeV2Attestation.sol";

interface VmConsent {
    function warp(uint256 timestamp) external;
    function chainId(uint256 newChainId) external;
    function deal(address account, uint256 newBalance) external;
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function prank(address msgSender) external;
    function expectRevert(bytes4 revertData) external;
    function expectPartialRevert(bytes4 revertData) external;
    function expectRevert() external;
}

contract ForceConsentFunds {
    constructor(address payable recipient) payable {
        selfdestruct(recipient);
    }
}

/// @dev These oracle envelopes are synthetic fixtures, not live AirnodeHub or creator-pilot evidence.
///      Creator EOA signatures are actual secp256k1 signatures over the full EIP-712 message using test-only keys.
contract PostAndPaidConsentFactoryTest {
    VmConsent private constant vm = VmConsent(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant CREATOR_KEY = 0xc0ffee;
    uint256 private constant AIRNODE_KEY = 0xa11ce;
    uint256 private constant OTHER_KEY = 0xb0b;
    uint256 private constant FEE = 0.00001 ether;
    uint256 private constant NOW = 1793410000;
    PostAndPaidConsentFactory private factory;
    address private creator;
    bool private rejectRefund;
    bool private reenterRefund;
    bool private refundReentryBlocked;
    bytes32 private refundAgreementId;

    receive() external payable {
        if (rejectRefund) revert("brand refuses transfer");
        if (reenterRefund) {
            try factory.refundAgreement(refundAgreementId) {}
                catch {
                refundReentryBlocked = true;
            }
        }
    }

    function setUp() public {
        vm.chainId(84532);
        vm.warp(NOW);
        vm.deal(address(this), 100 ether);
        creator = vm.addr(CREATOR_KEY);
        factory = new PostAndPaidConsentFactory(vm.addr(AIRNODE_KEY));
    }

    function _terms() private view returns (PostAndPaidConsentFactory.Terms memory t) {
        t.agreementId = keccak256("agreement-one");
        t.brand = address(this);
        t.creator = creator;
        t.authorId = "1234567";
        t.postId = "1846987139428634858";
        t.nonce = keccak256("unique-campaign-one");
        t.asset = address(0);
        t.feeWei = FEE;
        t.requiredText = factory.challengeFor(t.nonce, t.creator);
        t.postedAfter = uint64(NOW - 3 days);
        t.postedBefore = uint64(NOW);
        t.claimDeadline = uint64(NOW + 1 days);
        t.consentDeadline = uint64(NOW + 1 hours);
        t.maxResponseAge = 300;
    }

    function _rawSign(uint256 key, bytes32 digest) private returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _consent(PostAndPaidConsentFactory.Terms memory t) private returns (bytes memory) {
        return _rawSign(CREATOR_KEY, factory.hashTerms(t));
    }

    function _data(string memory post, string memory author, string memory text, string memory created)
        private
        pure
        returns (bytes memory)
    {
        return bytes(
            string.concat(
                '{"authorId":"', author, '","createdAt":"', created, '","postId":"', post, '","text":"', text, '"}'
            )
        );
    }

    function _validData(PostAndPaidConsentFactory.Terms memory t) private pure returns (bytes memory) {
        return
            _data(t.postId, t.authorId, string.concat("Agreed post ", t.requiredText), "Fri Oct 30 12:34:56 +0000 2026");
    }

    function _oracleForHash(uint256 key, bytes32 requestHash, uint256 timestamp, bytes memory data)
        private
        returns (bytes memory)
    {
        bytes32 digest = keccak256(abi.encodePacked(requestHash, timestamp, data));
        return _rawSign(key, keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest)));
    }

    function _oracle(PostAndPaidConsentFactory.Terms memory t, uint256 timestamp, bytes memory data)
        private
        returns (bytes memory)
    {
        return _oracleForHash(AIRNODE_KEY, factory.deriveRequestHash(t.postId), timestamp, data);
    }

    function _fund(PostAndPaidConsentFactory.Terms memory t) private returns (PostAndPaidEscrow child) {
        bytes memory data = _validData(t);
        address escrow =
            factory.fundAgreement{value: t.feeWei}(t, _consent(t), NOW - 1, data, _oracle(t, NOW - 1, data));
        return PostAndPaidEscrow(escrow);
    }

    function _unchanged(PostAndPaidConsentFactory.Terms memory t) private view {
        (address escrow,,,,) = factory.agreements(t.agreementId);
        require(escrow == address(0), "child was created");
        require(!factory.usedConsent(factory.hashTerms(t)), "consent consumed");
        require(!factory.usedNonce(t.creator, t.nonce), "nonce consumed");
        require(address(factory).balance == 0, "factory kept collateral");
        require(creator.balance == 0, "creator received funds");
    }

    function _rejectFunding(
        PostAndPaidConsentFactory.Terms memory t,
        bytes memory consent,
        uint256 timestamp,
        bytes memory data,
        bytes memory oracleSignature,
        bytes4 expected
    ) private {
        vm.expectPartialRevert(expected);
        factory.fundAgreement{value: t.feeWei}(t, consent, timestamp, data, oracleSignature);
        _unchanged(t);
    }

    function testChallengeIsCanonicalNonceAndBeneficiary() public view {
        bytes32 nonce = bytes32(uint256(1));
        string memory challenge = factory.challengeFor(nonce, address(0xABCDEF));
        require(bytes(challenge).length == 114, "wrong challenge length");
        require(
            keccak256(bytes(challenge))
                == keccak256(
                    bytes(
                        "[pap2:0000000000000000000000000000000000000000000000000000000000000001:0x0000000000000000000000000000000000abcdef]"
                    )
                ),
            "noncanonical challenge"
        );
    }

    function testIndependentViemStructHashVector() public view {
        PostAndPaidConsentFactory.Terms memory t = PostAndPaidConsentFactory.Terms({
            agreementId: 0x1111111111111111111111111111111111111111111111111111111111111111,
            brand: address(0x1111111111111111111111111111111111111111),
            creator: address(0x2222222222222222222222222222222222222222),
            authorId: "1234567",
            postId: "1846987139428634858",
            nonce: 0x3333333333333333333333333333333333333333333333333333333333333333,
            asset: address(0),
            feeWei: FEE,
            requiredText: "[pap2:3333333333333333333333333333333333333333333333333333333333333333:0x2222222222222222222222222222222222222222]",
            postedAfter: 1793150800,
            postedBefore: 1793410000,
            claimDeadline: 1793496400,
            consentDeadline: 1793413600,
            maxResponseAge: 300
        });
        // Independently generated with viem 2.57.13 hashStruct(CreatorConsent), not factory.hashTerms.
        require(
            factory.termsStructHash(t) == 0x298febed4a54345875f15a0ec42164dfc753bd25b0e9ef7bf0dbbb569132e17c,
            "EIP712 hash mismatch"
        );
    }

    function testActualTestWalletSignatureRecoversCreatorWithoutFunding() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        require(factory.verifyConsent(t, _consent(t)) == factory.hashTerms(t), "wrong consent digest");
        _unchanged(t);
    }

    function testPrefundingIntakeMayBeSignedBeforeDeployment() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory data = _validData(t);
        require(factory.verifyIntake(t, NOW - 1, data, _oracle(t, NOW - 1, data)) == keccak256(data), "wrong data hash");
        _unchanged(t);
    }

    function testValidConsentAndIntakeCreateSeparateFundedChild() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        PostAndPaidEscrow child = _fund(t);
        (address recorded, address brand, address beneficiary, uint256 fee, bytes32 digest) =
            factory.agreements(t.agreementId);
        require(
            recorded == address(child) && brand == address(this) && beneficiary == creator && fee == FEE,
            "wrong registry"
        );
        require(digest == factory.hashTerms(t), "wrong consent hash");
        require(child.brand() == address(factory), "refund authority must be factory");
        require(child.creator() == creator && child.payout() == FEE, "wrong beneficiary/fee");
        require(child.state() == PostAndPaidEscrow.State.Active && address(child).balance == FEE, "unfunded child");
        require(factory.usedConsent(digest) && factory.usedNonce(creator, t.nonce), "consent not consumed");
        require(factory.isEscrow(address(child)), "unknown child");
        require(address(factory).balance == 0 && creator.balance == 0, "early payment");
    }

    function testFreshPostFundingProofPaysCreatorOncePermissionlessly() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        PostAndPaidEscrow child = _fund(t);
        bytes memory data = _validData(t);
        bytes memory proof = _oracle(t, NOW, data);
        vm.prank(address(0x9999));
        child.submitResponse(NOW, data, proof);
        require(creator.balance == FEE && address(child).balance == 0, "payout missing");
        vm.expectRevert(PostAndPaidEscrow.AlreadySettled.selector);
        child.submitResponse(NOW, data, proof);
        require(creator.balance == FEE, "duplicate payout");
    }

    function testIntakeEnvelopeCannotReplaceFreshPayoutSnapshot() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        PostAndPaidEscrow child = _fund(t);
        bytes memory data = _validData(t);
        bytes memory proof = _oracle(t, NOW - 1, data);
        vm.expectRevert(PostAndPaidEscrow.ResponseBeforeFunding.selector);
        child.submitResponse(NOW - 1, data, proof);
        require(address(child).balance == FEE && creator.balance == 0, "protected funds changed");
    }

    function testRejectsEditedIntakeWithoutCreatingEscrow() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory data = _validData(t);
        bytes memory proof = _oracle(t, NOW, data);
        bytes memory edited =
            _data(t.postId, t.authorId, string.concat("Edited ", t.requiredText), "Fri Oct 30 12:34:56 +0000 2026");
        _rejectFunding(t, _consent(t), NOW, edited, proof, AirnodeV2Attestation.NotSignedByAirnode.selector);
    }

    function testRejectsStaleUneditedIntakeWithoutCreatingEscrow() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory data = _validData(t);
        bytes memory sig = _consent(t);
        bytes memory proof = _oracle(t, NOW, data);
        vm.warp(NOW + 301);
        _rejectFunding(t, sig, NOW, data, proof, PostAndPaidIntakeVerifier.StaleResponse.selector);
    }

    function testRejectsDifferentRequestWithoutCreatingEscrow() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory data = _validData(t);
        bytes memory proof = _oracleForHash(AIRNODE_KEY, keccak256("different request"), NOW, data);
        _rejectFunding(t, _consent(t), NOW, data, proof, AirnodeV2Attestation.NotSignedByAirnode.selector);
    }

    function testRejectsWrongAirnodeSignerWithoutCreatingEscrow() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory data = _validData(t);
        bytes memory proof = _oracleForHash(OTHER_KEY, factory.deriveRequestHash(t.postId), NOW, data);
        _rejectFunding(t, _consent(t), NOW, data, proof, AirnodeV2Attestation.NotSignedByAirnode.selector);
    }

    function testRejectsFutureIntakeWithoutCreatingEscrow() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory data = _validData(t);
        _rejectFunding(
            t, _consent(t), NOW + 1, data, _oracle(t, NOW + 1, data), PostAndPaidIntakeVerifier.FutureResponse.selector
        );
    }

    function testRejectsWrongPostInSignedData() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory data = _data("2", t.authorId, t.requiredText, "Fri Oct 30 12:34:56 +0000 2026");
        _rejectFunding(t, _consent(t), NOW, data, _oracle(t, NOW, data), PostAndPaidIntakeVerifier.WrongPost.selector);
    }

    function testRejectsWrongAuthorInSignedData() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory data = _data(t.postId, "2", t.requiredText, "Fri Oct 30 12:34:56 +0000 2026");
        _rejectFunding(t, _consent(t), NOW, data, _oracle(t, NOW, data), PostAndPaidIntakeVerifier.WrongAuthor.selector);
    }

    function testRejectsMissingExactChallenge() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory data = _data(t.postId, t.authorId, "No campaign challenge here", "Fri Oct 30 12:34:56 +0000 2026");
        _rejectFunding(
            t, _consent(t), NOW, data, _oracle(t, NOW, data), PostAndPaidIntakeVerifier.MissingChallenge.selector
        );
    }

    function testRejectsChallengeForAnotherBeneficiary() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory data = _data(
            t.postId, t.authorId, factory.challengeFor(t.nonce, address(0x1234)), "Fri Oct 30 12:34:56 +0000 2026"
        );
        _rejectFunding(
            t, _consent(t), NOW, data, _oracle(t, NOW, data), PostAndPaidIntakeVerifier.MissingChallenge.selector
        );
    }

    function testRejectsChallengeForAnotherNonce() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory data = _data(
            t.postId,
            t.authorId,
            factory.challengeFor(keccak256("another nonce"), t.creator),
            "Fri Oct 30 12:34:56 +0000 2026"
        );
        _rejectFunding(
            t, _consent(t), NOW, data, _oracle(t, NOW, data), PostAndPaidIntakeVerifier.MissingChallenge.selector
        );
    }

    function testRejectsPublicationOutsidePinnedWindow() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory data = _data(t.postId, t.authorId, t.requiredText, "Fri Oct 23 12:34:56 +0000 2026");
        _rejectFunding(
            t, _consent(t), NOW, data, _oracle(t, NOW, data), PostAndPaidIntakeVerifier.PostOutsideWindow.selector
        );
    }

    function _rejectMutation(uint256 kind) private {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory sig = _consent(t);
        if (kind == 0) t.postId = "2";
        if (kind == 1) t.authorId = "2";
        if (kind == 2) {
            t.creator = vm.addr(OTHER_KEY);
            t.requiredText = factory.challengeFor(t.nonce, t.creator);
        }
        if (kind == 3) t.feeWei += 1;
        if (kind == 4) t.brand = address(0x1234);
        if (kind == 5) {
            t.nonce = keccak256("changed nonce");
            t.requiredText = factory.challengeFor(t.nonce, t.creator);
        }
        if (kind == 6) t.agreementId = keccak256("changed agreement");
        if (kind == 7) t.postedAfter += 1;
        if (kind == 8) t.postedBefore -= 1;
        if (kind == 9) t.claimDeadline += 1;
        if (kind == 10) t.consentDeadline += 1;
        if (kind == 11) t.maxResponseAge += 1;
        vm.expectRevert(PostAndPaidConsentFactory.WrongCreator.selector);
        factory.verifyConsent(t, sig);
        _unchanged(t);
    }

    function testChangedConsentPostRejected() public {
        _rejectMutation(0);
    }

    function testChangedConsentAuthorRejected() public {
        _rejectMutation(1);
    }

    function testChangedConsentBeneficiaryRejected() public {
        _rejectMutation(2);
    }

    function testChangedConsentFeeRejected() public {
        _rejectMutation(3);
    }

    function testChangedConsentBrandRejected() public {
        _rejectMutation(4);
    }

    function testChangedConsentNonceRejected() public {
        _rejectMutation(5);
    }

    function testChangedConsentAgreementIdRejected() public {
        _rejectMutation(6);
    }

    function testChangedConsentPublicationStartRejected() public {
        _rejectMutation(7);
    }

    function testChangedConsentPublicationEndRejected() public {
        _rejectMutation(8);
    }

    function testChangedConsentClaimDeadlineRejected() public {
        _rejectMutation(9);
    }

    function testChangedConsentExpiryRejected() public {
        _rejectMutation(10);
    }

    function testChangedConsentResponseAgeRejected() public {
        _rejectMutation(11);
    }

    function testRejectsCallerChosenChallengeEvenWithCreatorSignature() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        t.requiredText = "a caller-chosen text";
        bytes memory sig = _consent(t);
        vm.expectRevert(PostAndPaidConsentFactory.InvalidTerms.selector);
        factory.verifyConsent(t, sig);
        _unchanged(t);
    }

    function testRejectsNonNativeAssetEvenWithCreatorSignature() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        t.asset = address(0x1234);
        bytes memory sig = _consent(t);
        vm.expectRevert(PostAndPaidConsentFactory.InvalidTerms.selector);
        factory.verifyConsent(t, sig);
        _unchanged(t);
    }

    function testRejectsExpiredConsentBeforeFunding() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory sig = _consent(t);
        vm.warp(t.consentDeadline);
        vm.expectRevert(PostAndPaidConsentFactory.ConsentExpired.selector);
        factory.verifyConsent(t, sig);
        _unchanged(t);
    }

    function testRejectsZeroAgreementAndZeroNonce() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        t.agreementId = 0;
        bytes memory sig = _consent(t);
        vm.expectRevert(PostAndPaidConsentFactory.InvalidTerms.selector);
        factory.verifyConsent(t, sig);
        t = _terms();
        t.nonce = 0;
        t.requiredText = factory.challengeFor(t.nonce, t.creator);
        sig = _consent(t);
        vm.expectRevert(PostAndPaidConsentFactory.InvalidTerms.selector);
        factory.verifyConsent(t, sig);
    }

    function _foreignConsent(
        PostAndPaidConsentFactory.Terms memory t,
        string memory name,
        string memory version,
        uint256 chain,
        address verifying
    ) private returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chain,
                verifying
            )
        );
        return _rawSign(CREATOR_KEY, keccak256(abi.encodePacked("\x19\x01", domain, factory.termsStructHash(t))));
    }

    function testRejectsDifferentDomainName() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory sig = _foreignConsent(t, "Another product", "2", 84532, address(factory));
        vm.expectRevert(PostAndPaidConsentFactory.WrongCreator.selector);
        factory.verifyConsent(t, sig);
        _unchanged(t);
    }

    function testRejectsDifferentDomainVersion() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory sig = _foreignConsent(t, "Post and Paid", "1", 84532, address(factory));
        vm.expectRevert(PostAndPaidConsentFactory.WrongCreator.selector);
        factory.verifyConsent(t, sig);
        _unchanged(t);
    }

    function testRejectsSignatureForAnotherChain() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory sig = _foreignConsent(t, "Post and Paid", "2", 1, address(factory));
        vm.expectRevert(PostAndPaidConsentFactory.WrongCreator.selector);
        factory.verifyConsent(t, sig);
        _unchanged(t);
    }

    function testRejectsSignatureForAnotherFactory() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory sig = _foreignConsent(t, "Post and Paid", "2", 84532, address(0x1234));
        vm.expectRevert(PostAndPaidConsentFactory.WrongCreator.selector);
        factory.verifyConsent(t, sig);
        _unchanged(t);
    }

    function testRejectsWrongCreatorSigningKey() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory sig = _rawSign(OTHER_KEY, factory.hashTerms(t));
        vm.expectRevert(PostAndPaidConsentFactory.WrongCreator.selector);
        factory.verifyConsent(t, sig);
        _unchanged(t);
    }

    function testRejectsConsentReplayAfterFundedIntake() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory sig = _consent(t);
        _fund(t);
        vm.expectRevert(PostAndPaidConsentFactory.ConsentAlreadyUsed.selector);
        factory.verifyConsent(t, sig);
        require(creator.balance == 0, "payout before proof");
    }

    function testRejectsReusedAgreementWithNewConsentNonce() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        _fund(t);
        t.nonce = keccak256("new nonce");
        t.requiredText = factory.challengeFor(t.nonce, t.creator);
        bytes memory sig = _consent(t);
        vm.expectRevert(PostAndPaidConsentFactory.AgreementAlreadyUsed.selector);
        factory.verifyConsent(t, sig);
    }

    function testRejectsReusedCreatorNonceForAnotherAgreement() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        _fund(t);
        t.agreementId = keccak256("new agreement");
        bytes memory sig = _consent(t);
        vm.expectRevert(PostAndPaidConsentFactory.NonceAlreadyUsed.selector);
        factory.verifyConsent(t, sig);
    }

    function testWrongFundingCallerCannotCreateEscrow() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory data = _validData(t);
        bytes memory sig = _consent(t);
        bytes memory proof = _oracle(t, NOW, data);
        vm.deal(address(0x1234), FEE);
        vm.prank(address(0x1234));
        vm.expectRevert(PostAndPaidConsentFactory.WrongBrand.selector);
        factory.fundAgreement{value: FEE}(t, sig, NOW, data, proof);
        _unchanged(t);
    }

    function testWrongValueCannotCreateEscrow() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory data = _validData(t);
        bytes memory sig = _consent(t);
        bytes memory proof = _oracle(t, NOW, data);
        vm.expectRevert(PostAndPaidConsentFactory.WrongFunding.selector);
        factory.fundAgreement{value: FEE + 1}(t, sig, NOW, data, proof);
        _unchanged(t);
    }

    function testWrongChainDeploymentAndConsentAreRejected() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory sig = _consent(t);
        vm.chainId(1);
        vm.expectRevert(PostAndPaidConsentFactory.WrongChain.selector);
        factory.verifyConsent(t, sig);
        vm.expectRevert(PostAndPaidConsentFactory.WrongChain.selector);
        new PostAndPaidConsentFactory(vm.addr(AIRNODE_KEY));
    }

    function testDirectFactoryTransfersAreRejected() public {
        (bool ok,) = address(factory).call{value: 1}("");
        require(!ok, "unexpected factory deposit");
        require(address(factory).balance == 0, "held unexpected funds");
    }

    function testExpiredUnpaidCollateralReturnsOnlyToOriginalBrand() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        PostAndPaidEscrow child = _fund(t);
        vm.warp(t.claimDeadline + 1);
        vm.prank(address(0x1234));
        vm.expectRevert(PostAndPaidConsentFactory.WrongBrand.selector);
        factory.refundAgreement(t.agreementId);
        uint256 before = address(this).balance;
        factory.refundAgreement(t.agreementId);
        require(address(this).balance == before + FEE, "wrong brand refund");
        require(child.state() == PostAndPaidEscrow.State.Refunded && address(child).balance == 0, "child not refunded");
        require(address(factory).balance == 0 && creator.balance == 0, "refund diverted");
        vm.expectRevert(PostAndPaidEscrow.AlreadySettled.selector);
        factory.refundAgreement(t.agreementId);
    }

    function testRefundCannotReleaseFactoryForcedFunds() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        PostAndPaidEscrow child = _fund(t);
        new ForceConsentFunds{value: 0.5 ether}(payable(address(factory)));
        vm.warp(t.claimDeadline + 1);
        uint256 before = address(this).balance;
        factory.refundAgreement(t.agreementId);
        require(address(this).balance == before + FEE, "factory balance used as refund");
        require(
            address(factory).balance == 0.5 ether && address(child).balance == 0, "forced funds mixed with collateral"
        );
    }

    function testRejectingBrandRollsBackChildRefund() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        PostAndPaidEscrow child = _fund(t);
        vm.warp(t.claimDeadline + 1);
        rejectRefund = true;
        vm.expectRevert(PostAndPaidConsentFactory.RefundForwardFailed.selector);
        factory.refundAgreement(t.agreementId);
        require(
            child.state() == PostAndPaidEscrow.State.Active && address(child).balance == FEE,
            "refund state was not atomic"
        );
        require(address(factory).balance == 0, "factory kept failed refund");
        rejectRefund = false;
        factory.refundAgreement(t.agreementId);
    }

    function testBrandRefundReentrancyCannotWithdrawTwice() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        PostAndPaidEscrow child = _fund(t);
        vm.warp(t.claimDeadline + 1);
        reenterRefund = true;
        refundAgreementId = t.agreementId;
        uint256 before = address(this).balance;
        factory.refundAgreement(t.agreementId);
        require(refundReentryBlocked && address(this).balance == before + FEE, "refund reentrancy");
        require(child.state() == PostAndPaidEscrow.State.Refunded, "child still active");
    }

    function testPaidAgreementCannotBeRefundedThroughFactory() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        PostAndPaidEscrow child = _fund(t);
        bytes memory data = _validData(t);
        child.submitResponse(NOW, data, _oracle(t, NOW, data));
        vm.warp(t.claimDeadline + 1);
        vm.expectRevert(PostAndPaidEscrow.AlreadySettled.selector);
        factory.refundAgreement(t.agreementId);
        require(creator.balance == FEE, "paid creator changed");
    }

    function testMissingSourceFieldCannotFund() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory data =
            bytes(
            string.concat('{"postId":"', t.postId, '","authorId":"', t.authorId, '","text":"', t.requiredText, '"}')
        );
        bytes memory sig = _consent(t);
        bytes memory proof = _oracle(t, NOW, data);
        vm.expectRevert();
        factory.fundAgreement{value: FEE}(t, sig, NOW, data, proof);
        _unchanged(t);
    }

    function testPublicationAfterSignedSnapshotCannotFund() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        t.postedBefore = uint64(NOW + 3600);
        bytes memory data = _data(t.postId, t.authorId, t.requiredText, "2026-10-31T01:26:41Z");
        _rejectFunding(
            t, _consent(t), NOW, data, _oracle(t, NOW, data), PostAndPaidIntakeVerifier.PostAfterSnapshot.selector
        );
    }

    function testInvalidIntakeDoesNotBurnValidConsent() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory sig = _consent(t);
        bytes memory bad = _data(t.postId, t.authorId, "Missing challenge", "Fri Oct 30 12:34:56 +0000 2026");
        _rejectFunding(t, sig, NOW, bad, _oracle(t, NOW, bad), PostAndPaidIntakeVerifier.MissingChallenge.selector);
        bytes memory valid = _validData(t);
        address child = factory.fundAgreement{value: FEE}(t, sig, NOW, valid, _oracle(t, NOW, valid));
        require(
            address(child).balance == FEE && factory.usedConsent(factory.hashTerms(t)),
            "consent was burned or not consumed"
        );
    }

    function testEconomicReplayCannotCreateSecondEscrow() public {
        PostAndPaidConsentFactory.Terms memory t = _terms();
        bytes memory sig = _consent(t);
        PostAndPaidEscrow child = _fund(t);
        bytes memory data = _validData(t);
        bytes memory proof = _oracle(t, NOW, data);
        vm.expectRevert(PostAndPaidConsentFactory.ConsentAlreadyUsed.selector);
        factory.fundAgreement{value: FEE}(t, sig, NOW, data, proof);
        require(
            address(child).balance == FEE && creator.balance == 0 && address(factory).balance == 0,
            "replay changed protected money"
        );
    }

    function testZeroAirnodeCannotBeTrusted() public {
        vm.expectRevert(PostAndPaidConsentFactory.InvalidTerms.selector);
        new PostAndPaidConsentFactory(address(0));
    }
}
