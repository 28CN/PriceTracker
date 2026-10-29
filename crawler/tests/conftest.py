import sys
from pathlib import Path

# Make `import main` work from crawler/tests/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
