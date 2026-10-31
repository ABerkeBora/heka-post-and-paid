// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IsoTimestamp} from "./IsoTimestamp.sol";
import {LibString} from "solady/utils/LibString.sol";

/// @notice Reads ISO timestamps and X's classic `Wed Oct 30 12:34:56 +0000 2024` format.
library TwitterTimestamp {
    error InvalidTwitterTimestamp();

    function parse(string memory value) internal pure returns (uint256) {
        bytes memory chars = bytes(value);
        // Require a complete timestamp with timezone, not a date-only string.
        if (chars.length >= 20 && chars[4] == "-") return IsoTimestamp.parse(value);
        if (
            chars.length != 30 || chars[3] != " " || chars[7] != " " || chars[10] != " "
                || chars[13] != ":" || chars[16] != ":" || chars[19] != " " || chars[25] != " "
                || (chars[20] != "+" && chars[20] != "-")
        ) revert InvalidTwitterTimestamp();
        string memory weekdays = "MonTueWedThuFriSatSun";
        string memory weekday = LibString.slice(value, 0, 3);
        uint256 weekdayIndex = LibString.indexOf(weekdays, weekday);
        if (weekdayIndex == LibString.NOT_FOUND || weekdayIndex % 3 != 0) revert InvalidTwitterTimestamp();
        string memory months = "JanFebMarAprMayJunJulAugSepOctNovDec";
        uint256 monthIndex = LibString.indexOf(months, LibString.slice(value, 4, 7));
        if (monthIndex == LibString.NOT_FOUND || monthIndex % 3 != 0) revert InvalidTwitterTimestamp();
        uint256 month = monthIndex / 3 + 1;
        string memory monthText = month < 10
            ? string.concat("0", LibString.toString(month)) : LibString.toString(month);
        string memory iso = string.concat(
            LibString.slice(value, 26, 30), "-", monthText, "-", LibString.slice(value, 8, 10),
            "T", LibString.slice(value, 11, 19), LibString.slice(value, 20, 25)
        );
        return IsoTimestamp.parse(iso);
    }
}
