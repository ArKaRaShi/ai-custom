export interface Greeting {
  text: string;
}

export function buildGreeting(name: string): Greeting {
  return { text: `hello ${name.trim()}` };
}
