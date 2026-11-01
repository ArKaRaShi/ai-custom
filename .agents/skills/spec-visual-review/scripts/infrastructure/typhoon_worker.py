"""Translate English review text into Thai with Typhoon Translate on Apple Silicon (MLX).

Protocol: `--mode translate` reads {"texts": [...]} as JSON on stdin and prints one JSON line,
{"translations": [...]}, on stdout. `--mode download` fetches the pinned model revision.
All progress output goes to stderr so stdout stays machine readable.
"""

import argparse
import json
import sys
from typing import Dict, List, Optional

SYSTEM_PROMPT: str = (
    "Translate the complete text into Thai without adding or omitting information. "
    "Preserve every numbered placeholder such as ⟦0⟧ exactly once and in its context. "
    "Keep these English words exactly as written: agent, agents, manifest, remote, backup. "
    "Return only the translation."
)
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


def translate(
    model_id: str, revision: str, texts: List[str], contexts: Optional[List[str]] = None
) -> List[str]:
    from mlx_lm import generate, load
    from mlx_lm.sample_utils import make_sampler

    model, tokenizer = load(model_id, revision=revision)
    sampler = make_sampler(temp=0.0)
    translations: List[str] = []
    for index, text in enumerate(texts):
        system_prompt: str = SYSTEM_PROMPT
        if contexts is not None:
            system_prompt += (
                "\nThe following is background context only; do not translate or repeat it:\n"
                + contexts[index]
                + "\nTranslate only the user's text."
            )
        messages: List[Dict[str, str]] = [
            {"role": "system", "content": system_prompt},
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
    print(json.dumps({"translations": translate(args.model, args.revision, texts, payload.get("contexts"))}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
