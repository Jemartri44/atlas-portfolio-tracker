// A mail address as the jobs accept it (feature 016): the recipient read from
// SSM and the sender of the configuration. **One** address, plain ASCII, with
// nothing a header could be split on — no space, comma, `<`, `>`, `;` or line
// break — at most 254 characters, a local part of at most 64 and a domain of
// dotted labels. What is not an address never sends (R6).

const LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

export const isMailAddress = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 254) {
    return false;
  }
  const at = value.indexOf("@");
  if (at < 1 || at !== value.lastIndexOf("@")) {
    return false;
  }
  const local = value.slice(0, at);
  const labels = value.slice(at + 1).split(".");
  return (
    local.length <= 64 &&
    LOCAL.test(local) &&
    labels.length >= 2 &&
    labels.every((label) => LABEL.test(label))
  );
};
