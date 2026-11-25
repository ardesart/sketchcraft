# Hidden, restartable runner for train_v5.py (pythonw.exe). A scheduled task fires it every 20 min:
# it exits at once if training is DONE or already running, otherwise it (re)starts and resumes from the last checkpoint.
import os, sys, runpy, traceback, time
os.chdir(r"C:\Users\rsutt\sketchcraft-ai")
os.environ["FOR_DISABLE_CONSOLE_CTRL_HANDLER"] = "1"
if os.path.exists("out5/DONE") or not os.path.exists("out4/DONE"):  # wait for v4 to finish: one training on the GPU at a time
    sys.exit(0)
lock = "out5.lock"
os.makedirs("out5", exist_ok=True)
try:
    if os.path.exists(lock) and time.time() - os.path.getmtime(lock) < 120:
        sys.exit(0)  # another run is alive (it touches the lock every minute)
except OSError:
    pass
import threading
def beat():
    while True:
        open(lock, "w").write(str(os.getpid())); time.sleep(60)
threading.Thread(target=beat, daemon=True).start()
log = open("train_v5.log", "a", buffering=1, encoding="utf-8")
sys.stdout = sys.stderr = log
print("=== start", time.ctime(), flush=True)
code = 0
try:
    runpy.run_path("train_v5.py", run_name="__main__")
    open("out5/DONE", "w").write(time.ctime())
except SystemExit as e:
    code = e.code or 0
except BaseException:
    traceback.print_exc(); code = 1
print("EXIT", code, time.ctime(), flush=True)
try: os.remove(lock)
except OSError: pass
