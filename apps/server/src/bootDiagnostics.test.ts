import assert from "node:assert/strict";
import test from "node:test";
import { bootFailureFields } from "./bootDiagnostics.js";

test("boot diagnostics withhold arbitrary secrets in message, name, code, cause, stack and meta", () => {
  const secret = "postgresql://user:password@private-host/db?token=private-token";
  const error = Object.assign(new Error(secret, { cause: Object.assign(new Error(secret), { code: secret }) }), { name: secret, code: secret, meta: { secret } });
  const fields = bootFailureFields("MEDIA_RESTORE", error);
  assert.equal(fields.bootStage, "MEDIA_RESTORE");
  assert.equal(fields.errorName, "UnknownError");
  assert.equal(fields.errorCode, "UNKNOWN");
  assert.ok(!JSON.stringify(fields).includes(secret));
  assert.ok(!JSON.stringify(fields).includes("private-host"));
  assert.equal(fields.causeName, "Error");
  assert.equal(bootFailureFields("AUTH_RESTORE", secret).errorName, "UnknownError");
});
test("Prisma initialization and query codes and known restore failures remain actionable", () => {
  for (const property of ["code", "errorCode"]) {
    const error = Object.assign(new Error("sensitive raw query and connection"), { name: "PrismaClientInitializationError", [property]: "P2022" });
    const fields = bootFailureFields("HOUSE_RESTORE", error);
    assert.equal(fields.prismaCode, "P2022");
    assert.equal(fields.safeMessage, "Expected database column missing.");
  }
  const error = new Error("O cofre de tokens do Google Drive não pôde ser aberto. Verifique a chave de criptografia.");
  assert.equal(bootFailureFields("DRIVE_RESTORE", error).safeMessage, error.message);
  assert.equal(bootFailureFields("HTTP_LISTEN", Object.assign(new Error("private address"), { code: "EADDRINUSE" })).errorCode, "EADDRINUSE");
});
