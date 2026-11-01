"""Translate English review text into Thai with Typhoon Translate on Apple Silicon (MLX).

Protocol: `--mode translate` reads {"texts": [...]} as JSON on stdin and prints one JSON line,
{"translations": [...]}, on stdout. `--mode download` fetches the pinned model revision.
All progress output goes to stderr so stdout stays machine readable.
"""

import argparse
import json
import sys
from typing import Dict, List

SYSTEM_PROMPT: str = (
    "Translate the following text into Thai. "
    "Keep these English words exactly as written, do not translate them: "
    "agent, agents, manifest, remote, backup."
)
EXAMPLE_EN: str = "The agents read the manifest and the remote backup, but they do not change them."
EXAMPLE_TH: str = "agents จะอ่าน manifest และ remote backup แต่จะไม่เปลี่ยนแปลงสิ่งเหล่านั้น"
MAX_TOKENS: int = 1024


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=["translate", "download"], required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--revision", required=True)
    return parser.parse_args()


def download(model: str, revision: str) -> None:
    from huggingface_hub import snapshot_download

    path: str = snapshot_download(repo_id=model, revision=revision)
    print(json.dumps({"downloaded": path}))


def translate(model_id: str, revision: str, texts: List[str]) -> List[str]:
    from mlx_lm import generate, load
    from mlx_lm.sample_utils import make_sampler

    model, tokenizer = load(model_id, revision=revision)
    sampler = make_sampler(temp=0.0)
    translations: List[str] = []
    for text in texts:
        messages: List[Dict[str, str]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": EXAMPLE_EN},
            {"role": "assistant", "content": EXAMPLE_TH},
            {"role": "user", "content": text},
        ]
        prompt = tokenizer.apply_chat_template(messages, add_generation_prompt=True)
        output: str = generate(model, tokenizer, prompt=prompt, max_tokens=MAX_TOKENS, sampler=sampler)
        translations.append(output.strip())
    return translations


def main() -> int:
    args = parse_args()
    if args.mode == "download":
        download(args.model, args.revision)
        return 0
    payload: Dict[str, List[str]] = json.load(sys.stdin)
    texts: List[str] = payload["texts"]
    print(json.dumps({"translations": translate(args.model, args.revision, texts)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
