"""Prints one stage of `df.dropna().mean()` for examples/trace-dropna.json: df, dropna, or mean."""
import sys

import numpy as np
import pandas as pd

df = pd.DataFrame(
    {"sensor A": [10.0, 12.0, 18.0], "sensor B": [20.0, np.nan, 26.0]},
    index=pd.to_datetime(["2026-11-18 09:00", "2026-11-18 09:01", "2026-11-18 09:02"]).strftime("%H:%M").rename("dt"),
)
stages = {"df": df, "dropna": df.dropna(), "mean": df.dropna().mean()}
print(stages[sys.argv[1]])
