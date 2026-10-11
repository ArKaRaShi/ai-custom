import { expect, test } from "bun:test";
import { Greet } from "../scripts/application/use-cases/greet";

test("greets a trimmed name", () => {
  expect(new Greet().execute({ name: "  sam " })).toEqual({ text: "hello sam" });
});
