// import { ethers } from "ethers";
// import { OlaAddress, OlaWallet } from "../src";
//
// async function generateAccount() {
//   // @note: address - '0x54253578fFc18424a174DC81Ab98c43b654752F6'
//   const ethPrivateKey = "0xead3c88c32e5938420ae67d7e180005512aee9eb7ab4ebedff58f95f4ef06507";
//
//   /**
//    * Browser:
//    * ethWallet = new ethers.BrowserProvider(window.ethereum)
//    */
//   const ethWallet = new ethers.Wallet(ethPrivateKey);
//   const olaWallet = await OlaWallet.fromETHSignature(ethWallet);
//   // @note: connect to provider
//   olaWallet.connect("https://pre-alpha-api.olavm.com:443", 1027);
//   return olaWallet;
// }
//
// describe("Proposals Contract", () => {
//   const contracAddress = "0x1fa12c6c27a44cbe8996a030d218b3082e6300b259576b6c91c7cc4fdd2e6bf9";
//   const proposalAbi = [
//     {
//       name: "createProposal",
//       type: "function",
//       inputs: [
//         {
//           name: "_contentHash",
//           type: "hash",
//         },
//         {
//           name: "_deadline",
//           type: "u32",
//         },
//         {
//           name: "_votingType",
//           type: "u32",
//         },
//         {
//           name: "_proposalType",
//           type: "u32",
//         },
//       ],
//       outputs: [],
//     },
//     {
//       name: "getProposalsByOwner",
//       type: "function",
//       inputs: [
//         {
//           name: "_owner",
//           type: "address",
//         },
//       ],
//       outputs: [
//         {
//           name: "",
//           type: "hash[]",
//         },
//       ],
//     },
//     {
//       name: "getProposal",
//       type: "function",
//       inputs: [
//         {
//           name: "_contentHash",
//           type: "hash",
//         },
//       ],
//       outputs: [
//         {
//           name: "",
//           type: "tuple",
//           components: [
//             {
//               name: "proposer",
//               type: "address",
//             },
//             {
//               name: "deadline",
//               type: "u32",
//             },
//             {
//               name: "totalSupport",
//               type: "u32",
//             },
//             {
//               name: "totalAgainst",
//               type: "u32",
//             },
//             {
//               name: "votingType",
//               type: "u32",
//             },
//             {
//               name: "proposalType",
//               type: "u32",
//             },
//           ],
//         },
//       ],
//     },
//   ];
//
//   it("getProposalsByOwner()", async () => {
//     const olaWallet = await generateAccount();
//     const params = [
//       {
//         Address: OlaAddress.toBigintArray(
//           "0x753fbec909cdd4398219dcda09eb758d235821f4bc374c69723b3685d5fc8a7e"
//         ),
//       },
//     ];
//     try {
//       const result = await olaWallet.call(
//         proposalAbi,
//         "getProposalsByOwner(address)",
//         contracAddress,
//         params
//       );
//       console.log("getProposalsByOwner", result);
//     } catch (error) {
//       console.log("error:", error);
//     }
//   });
//
//   it("getProposal()", async () => {
//     const olaWallet = await generateAccount();
//     const _contentHash = new Uint8Array(32);
//     _contentHash.fill(4);
//     const params = [{ Hash: Array.from(_contentHash) }];
//     try {
//       const result = await olaWallet.call(proposalAbi, "getProposal(hash)", contracAddress, params);
//       console.log("getProposal", result);
//     } catch (error) {
//       console.log("error:", error);
//     }
//   });
// });
