import assert from "node:assert/strict";
import test from "node:test";
import {
  binaryModuleWriteAbi,
  binaryPoolWriteAbi,
  erc20WriteAbi,
  erc6909Abi,
} from "@somnia-chain/markets-sdk";

function signature(abi, name) {
  const entry = abi.find((item) => item.type === "function" && item.name === name);
  assert.ok(entry, `DreamDEX SDK must expose ${name}`);
  return `${entry.name}(${entry.inputs.map((input) => input.type).join(",")})`;
}

test("DreamDEX 0.29 contract call signatures remain compatible", () => {
  assert.equal(signature(erc20WriteAbi, "approve"), "approve(address,uint256)");
  assert.equal(signature(erc6909Abi, "setOperator"), "setOperator(address,bool)");
  assert.equal(
    signature(binaryPoolWriteAbi, "placeBinaryOrder"),
    "placeBinaryOrder(uint8,uint256,uint256,uint64,uint8,uint8,address,uint96,uint64)",
  );
  assert.equal(signature(binaryPoolWriteAbi, "approveBuilder"), "approveBuilder(address,uint256)");
  assert.equal(
    signature(binaryModuleWriteAbi, "redeemMany"),
    "redeemMany(uint32,bytes32,bytes32[],uint8[],uint256[])",
  );
});
