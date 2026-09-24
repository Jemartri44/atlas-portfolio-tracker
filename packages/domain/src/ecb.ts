// The ECB reference rates and the local configuration, as a **separate entry
// point** of the domain (feature 012), for the same reason as `fiscal.ts`:
// nothing of the ECB may land on the boot path of the web (decision (r) of
// prompt 012). A lazily loaded screen imports from here and gets a chunk of its
// own; the barrel never re-exports any of it, and the architecture test holds
// that.

export {
  DEFAULT_LOCAL_CONFIG,
  LOCAL_CONFIG_FILE,
  type LocalConfig,
  parseLocalConfig,
} from "./config/local-config.js";
export { type BrokerSettlement, brokerSettlementOf } from "./ecb/broker-settlement.js";
