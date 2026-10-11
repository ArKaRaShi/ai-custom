import { buildGreeting, type Greeting } from "../../domain/greeting";

export interface GreetInput {
  name: string;
}

export type GreetOutput = Greeting;

/** One use case, one public method. Add constructor dependencies when it needs I/O or plugins. */
export class Greet {
  execute(input: GreetInput): GreetOutput {
    return buildGreeting(input.name);
  }
}
