// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PostAndPaidEscrow} from "../contracts/PostAndPaidEscrow.sol";
import {AirnodeV2Attestation} from "../contracts/AirnodeV2Attestation.sol";
import {TwitterTimestamp} from "../contracts/TwitterTimestamp.sol";

interface Vm {
    function warp(uint256 timestamp) external;
    function deal(address account, uint256 newBalance) external;
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function prank(address msgSender) external;
    function expectRevert(bytes4 revertData) external;
    function expectPartialRevert(bytes4 revertData) external;
    function expectRevert() external;
}

contract ReentrantCreator {
    PostAndPaidEscrow public escrow;
    bytes public data;
    bytes public signature;
    uint256 public timestamp;
    uint256 public receipts;
    bool public blocked;

    function configure(PostAndPaidEscrow escrow_, uint256 timestamp_, bytes memory data_, bytes memory signature_)
        external
    {
        escrow = escrow_;
        timestamp = timestamp_;
        data = data_;
        signature = signature_;
    }

    receive() external payable {
        receipts++;
        try escrow.submitResponse(timestamp, data, signature) {} catch { blocked = true; }
    }
}

contract RejectingCreator {
    receive() external payable { revert("cannot receive"); }
}

contract TimestampHarness {
    function parse(string memory value) external pure returns (uint256) { return TwitterTimestamp.parse(value); }
}

/// @dev Synthetic signer fixtures exercise the contract's checks. Live Airnode envelopes are separate evidence.
contract PostAndPaidEscrowTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant AIRNODE_KEY = 0xa11ce;
    uint256 private constant OTHER_KEY = 0xb0b;
    uint256 private constant FEE = 0.001 ether;
    uint256 private constant NOW = 1793410000;
    address payable private creator = payable(address(0xc0ffee));
    PostAndPaidEscrow private escrow;

    receive() external payable {}

    function setUp() public {
        vm.warp(NOW);
        vm.deal(address(this), 100 ether);
        escrow = new PostAndPaidEscrow{value: FEE}(_config(creator));
    }

    function _config(address payable beneficiary) private returns (PostAndPaidEscrow.Config memory) {
        return PostAndPaidEscrow.Config({
            creator: beneficiary,
            airnode: vm.addr(AIRNODE_KEY),
            postId: "1846987139428634858",
            authorId: "1234567",
            campaignCode: "#HEKA",
            postedAfter: uint64(NOW - 3 days),
            postedBefore: uint64(NOW),
            claimDeadline: uint64(NOW + 1 days),
            maxResponseAge: 300
        });
    }

    function _data(string memory post, string memory author, string memory text, string memory created)
        private pure returns (bytes memory)
    {
        return bytes(string.concat(
            '{"authorId":"', author, '","createdAt":"', created,
            '","postId":"', post, '","text":"', text, '"}'
        ));
    }

    function _validData() private pure returns (bytes memory) {
        return _data("1846987139428634858", "1234567", "A launch for #HEKA", "Fri Oct 30 12:34:56 +0000 2026");
    }

    function _sign(uint256 key, bytes32 request, uint256 timestamp, bytes memory data)
        private returns (bytes memory)
    {
        bytes32 digest = keccak256(abi.encodePacked(request, timestamp, data));
        bytes32 messageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, messageHash);
        return abi.encodePacked(r, s, v);
    }

    function _signature(uint256 timestamp, bytes memory data) private returns (bytes memory) {
        return _sign(AIRNODE_KEY, escrow.requestHash(), timestamp, data);
    }

    function _unchanged() private view {
        require(escrow.state() == PostAndPaidEscrow.State.Active, "state changed");
        require(address(escrow).balance == FEE, "collateral changed");
        require(creator.balance == 0, "creator paid");
    }

    function testPaysFixedCreatorFromPermissionlessSubmission() public {
        bytes memory data = _validData();
        bytes memory signature = _signature(NOW, data);
        vm.prank(address(0x9999));
        escrow.submitResponse(NOW, data, signature);
        require(escrow.state() == PostAndPaidEscrow.State.Paid, "not paid");
        require(creator.balance == FEE, "wrong amount");
        require(address(escrow).balance == 0, "collateral not released");
    }

    function testRejectsEditedSignedValue() public {
        bytes memory signature = _signature(NOW, _validData());
        bytes memory edited = _data("1846987139428634858", "1234567", "Tampered #HEKA", "Fri Oct 30 12:34:56 +0000 2026");
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        escrow.submitResponse(NOW, edited, signature);
        _unchanged();
    }

    function testRejectsStaleRealisticallyUnmodifiedEnvelope() public {
        bytes memory data = _validData();
        bytes memory signature = _signature(NOW, data);
        vm.warp(NOW + 301);
        vm.expectRevert(PostAndPaidEscrow.ResponseTooOld.selector);
        escrow.submitResponse(NOW, data, signature);
        _unchanged();
    }

    function testRejectsAnotherRequest() public {
        bytes memory data = _validData();
        bytes memory signature = _sign(AIRNODE_KEY, keccak256("another request"), NOW, data);
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        escrow.submitResponse(NOW, data, signature);
        _unchanged();
    }

    function testRejectsWrongSignerEvenIfClaimedAirnodeAddressIsCorrect() public {
        bytes memory data = _validData();
        bytes memory signature = _sign(OTHER_KEY, escrow.requestHash(), NOW, data);
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        escrow.submitResponse(NOW, data, signature);
        _unchanged();
    }

    function testRejectsReplay() public {
        bytes memory data = _validData();
        bytes memory signature = _signature(NOW, data);
        escrow.submitResponse(NOW, data, signature);
        vm.expectRevert(PostAndPaidEscrow.AlreadySettled.selector);
        escrow.submitResponse(NOW, data, signature);
        require(creator.balance == FEE, "paid twice");
    }

    function testRejectsWrongPost() public {
        bytes memory data = _data("2", "1234567", "A launch for #HEKA", "Fri Oct 30 12:34:56 +0000 2026");
        bytes memory signature = _signature(NOW, data);
        vm.expectRevert(PostAndPaidEscrow.WrongPost.selector);
        escrow.submitResponse(NOW, data, signature);
        _unchanged();
    }

    function testRejectsWrongAuthor() public {
        bytes memory data = _data("1846987139428634858", "2", "A launch for #HEKA", "Fri Oct 30 12:34:56 +0000 2026");
        bytes memory signature = _signature(NOW, data);
        vm.expectRevert(PostAndPaidEscrow.WrongAuthor.selector);
        escrow.submitResponse(NOW, data, signature);
        _unchanged();
    }

    function testRejectsMissingCampaignCode() public {
        bytes memory data = _data("1846987139428634858", "1234567", "A launch", "Fri Oct 30 12:34:56 +0000 2026");
        bytes memory signature = _signature(NOW, data);
        vm.expectRevert(PostAndPaidEscrow.CampaignCodeMissing.selector);
        escrow.submitResponse(NOW, data, signature);
        _unchanged();
    }

    function testRejectsOutsidePostedTimeWindow() public {
        bytes memory data = _data("1846987139428634858", "1234567", "A launch #HEKA", "Fri Oct 23 12:34:56 +0000 2026");
        bytes memory signature = _signature(NOW, data);
        vm.expectRevert(PostAndPaidEscrow.PostOutsideWindow.selector);
        escrow.submitResponse(NOW, data, signature);
        _unchanged();
    }

    function testRejectsMalformedTimestamp() public {
        bytes memory data = _data("1846987139428634858", "1234567", "A launch #HEKA", "Friday maybe");
        bytes memory signature = _signature(NOW, data);
        vm.expectRevert(TwitterTimestamp.InvalidTwitterTimestamp.selector);
        escrow.submitResponse(NOW, data, signature);
        _unchanged();
    }

    function testRejectsMissingField() public {
        bytes memory data = bytes('{"authorId":"1234567","postId":"1846987139428634858","text":"#HEKA"}');
        bytes memory signature = _signature(NOW, data);
        vm.expectRevert();
        escrow.submitResponse(NOW, data, signature);
        _unchanged();
    }

    function testRejectsFutureEnvelope() public {
        bytes memory data = _validData();
        bytes memory signature = _signature(NOW + 1, data);
        vm.expectRevert(PostAndPaidEscrow.ResponseFromFuture.selector);
        escrow.submitResponse(NOW + 1, data, signature);
        _unchanged();
    }

    function testRejectsEnvelopeBeforeFunding() public {
        bytes memory data = _validData();
        bytes memory signature = _signature(NOW - 1, data);
        vm.expectRevert(PostAndPaidEscrow.ResponseBeforeFunding.selector);
        escrow.submitResponse(NOW - 1, data, signature);
        _unchanged();
    }

    function testRejectsAfterDeadline() public {
        bytes memory data = _validData();
        bytes memory signature = _signature(NOW, data);
        vm.warp(NOW + 1 days + 1);
        vm.expectRevert(PostAndPaidEscrow.DeadlinePassed.selector);
        escrow.submitResponse(NOW, data, signature);
        _unchanged();
    }

    function testRejectsEarlyRefund() public {
        vm.expectRevert(PostAndPaidEscrow.RefundTooEarly.selector);
        escrow.refund();
        _unchanged();
    }

    function testOnlyBrandCanRefund() public {
        vm.warp(NOW + 1 days + 1);
        vm.prank(address(0x123));
        vm.expectRevert(PostAndPaidEscrow.NotBrand.selector);
        escrow.refund();
        _unchanged();
    }

    function testRefundsExpiredUnpaidAgreementOnce() public {
        uint256 initial = address(this).balance;
        vm.warp(NOW + 1 days + 1);
        escrow.refund();
        require(escrow.state() == PostAndPaidEscrow.State.Refunded, "not refunded");
        require(address(this).balance == initial + FEE, "wrong refund");
        require(address(escrow).balance == 0, "funds remain");
        vm.expectRevert(PostAndPaidEscrow.AlreadySettled.selector);
        escrow.refund();
    }

    function testCannotRefundPaidAgreement() public {
        bytes memory data = _validData();
        escrow.submitResponse(NOW, data, _signature(NOW, data));
        vm.warp(NOW + 1 days + 1);
        vm.expectRevert(PostAndPaidEscrow.AlreadySettled.selector);
        escrow.refund();
    }

    function testReentrancyCannotPayTwice() public {
        ReentrantCreator receiver = new ReentrantCreator();
        escrow = new PostAndPaidEscrow{value: FEE}(_config(payable(address(receiver))));
        bytes memory data = _validData();
        bytes memory signature = _signature(NOW, data);
        receiver.configure(escrow, NOW, data, signature);
        escrow.submitResponse(NOW, data, signature);
        require(receiver.blocked(), "reentry allowed");
        require(receiver.receipts() == 1, "multiple receipts");
        require(address(receiver).balance == FEE, "wrong payment");
    }

    function testCreatorTransferFailurePreservesCollateralAndClaim() public {
        RejectingCreator receiver = new RejectingCreator();
        escrow = new PostAndPaidEscrow{value: FEE}(_config(payable(address(receiver))));
        bytes memory data = _validData();
        bytes memory signature = _signature(NOW, data);
        vm.expectRevert(PostAndPaidEscrow.PaymentFailed.selector);
        escrow.submitResponse(NOW, data, signature);
        _unchanged();
    }

    function testDerivesHashOfExactFixedRequest() public view {
        bytes32 expected = keccak256(bytes('["tweetsByIds",[["tweet_ids","1846987139428634858"]],[["authorId","/tweets/0/author/id"],["createdAt","/tweets/0/createdAt"],["postId","/tweets/0/id"],["text","/tweets/0/text"]]]'));
        require(escrow.requestHash() == expected, "wrong request encoding");
    }

    function testRejectsZeroFundingAndSelfPayment() public {
        PostAndPaidEscrow.Config memory config = _config(creator);
        vm.expectRevert(PostAndPaidEscrow.InvalidAgreement.selector);
        new PostAndPaidEscrow(config);
        config.creator = payable(address(this));
        vm.expectRevert(PostAndPaidEscrow.InvalidAgreement.selector);
        new PostAndPaidEscrow{value: FEE}(config);
    }

    function testRejectsArbitraryPostParameterEncoding() public {
        vm.expectRevert(PostAndPaidEscrow.InvalidAgreement.selector);
        escrow.deriveRequestHash('1"],["arbitrary","operation');
    }

    function testClassicAndIsoTimestampsAgree() public {
        TimestampHarness harness = new TimestampHarness();
        require(harness.parse("Fri Oct 30 12:34:56 +0000 2026") == harness.parse("2026-10-30T12:34:56Z"), "classic differs");
        require(harness.parse("Fri Oct 30 14:34:56 +0200 2026") == harness.parse("2026-10-30T12:34:56Z"), "offset differs");
        vm.expectRevert();
        harness.parse("Fri Xxx 30 12:34:56 +0000 2026");
    }
}
