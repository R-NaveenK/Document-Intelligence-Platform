import os
import sys
from pathlib import Path

# Add validation-engine to Python path
engine_dir = Path(__file__).resolve().parent / "validation-engine"
if str(engine_dir) not in sys.path:
    sys.path.insert(0, str(engine_dir))

# Change current working directory to validation-engine
os.chdir(engine_dir)

# Import and execute main from validation-engine
import main

if __name__ == "__main__":
    main.main()
