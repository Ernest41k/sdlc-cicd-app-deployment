## 4. Set up AWS EC2 (one time)

1. **Launch an instance** in the EC2 console:
   - AMI: **Amazon Linux 2023**
   - Type: `t2.micro` or `t3.micro` (free tier eligible)
   - Key pair: create a new one and download the `.pem` file
   - Security group inbound rules:
     - **HTTP (80)** from `0.0.0.0/0` (so anyone can see the app)
     - **SSH (22)** from `0.0.0.0/0` (GitHub-hosted runners use changing IPs; see *Security notes*)
   - Optional: paste the contents of `deploy/ec2-setup.sh` into **Advanced details → User data** to skip step 3.

2. **Run the setup script** (skip if you used User data):
   ```bash
     vim 
     paste the script content and save
   ```
   **Make the script executable
   chmod 755 ec2-setup.sh

   **Run the script
   sudo su
   ./ec2-setup.sh


   Visiting `http://<EC2_PUBLIC_IP>` now shows a *502 Bad Gateway*. That's expected: nginx is running but no app has been deployed yet.

## 5. Connect GitHub to EC2 (one time)

# Create a GitHub Repository
test-sldc-deployment
git init
git add README.md
git commit -m "first commit"
git branch -M main
git remote add origin git@github.com:Ernest41k/test-sldc-deployment.git
git push -u origin main

2. In the repo go to **Settings → Secrets and variables → Actions**:

   | Kind | Name | Value |
   |---|---|---|
   | **Secret** | `EC2_SSH_KEY` | Entire contents of your `.pem` file, including the `BEGIN`/`END` lines |
   | **Variable** | `EC2_HOST` | Public IP or DNS of the instance, e.g. `54.12.34.56` |
   | **Variable** | `EC2_USER` | `ec2-user` |

# Create a feature branch
git checkout -b TIC-sldc
git add .
git commit -m "deploying sldc app to ec2"
git push origin TIC-sldc

# Create a pull request. (This should trigger the feature branch pipeline to run without deploying the app)
Once pipeline succeeds, 
Click on "Pull requests"
Click on you Pull Request
click on "merge pull request"
Click on "Confirm Pull request" to merge to main branch
Click on "Actions" to monitor you running main branch pipeline
merge to main
====================================================================================================================================================================================================================================================================
## 6. What each stage of the pipeline does

The pipeline lives in `.github/workflows/pipeline.yml`. Every stage is a separate **job** that runs on a fresh
GitHub-hosted Linux machine (a "runner"). If a stage fails, every stage after it is skipped ("fail fast"), so
broken code never reaches the server.

```
                 ┌─► 2a. Test ────────┐
1. Lint ─────────┤                    ├─► 3. Build ─► 4. Deploy to EC2 (main branch only)
                 └─► 2b. CodeQL scan ─┘
```

| Stage | Runs on a feature branch / PR? | Runs on `main`? |
|---|---|---|
| 1. Lint | Yes | Yes |
| 2a. Test | Yes | Yes |
| 2b. CodeQL scan | Yes | Yes |
| 3. Build | Yes | Yes |
| 4. Deploy to EC2 | **No** | **Yes** |

### 1. Lint

**What it does:** Reads the source code *without running it* and checks it for mistakes and style problems,
for example unused variables, undefined variables or typos in names.

**How:** Downloads the code, installs the project's packages (`npm ci`) and runs `npm run lint`, which runs **ESLint**
using the rules in `eslint.config.js`.

**Why it comes first:** There's no point testing or building
code that has obvious mistakes.

**If it fails:** The pipeline stops. Nothing else runs.

### 2a. Test

**What it does:** Runs the automated tests to prove the application behaves the way it should.

**How:** Installs the packages and runs `npm test`, which runs **Jest**. There are two kinds of tests in the `tests/` folder:
- **Unit tests** (`tasks.test.js`) check small pieces of logic on their own, e.g. "a task with an empty title is rejected".
- **Integration tests** (`app.test.js`) send real HTTP requests to the app, e.g. "`GET /health` returns 200 OK".

It also produces a **code coverage report** showing how much of the code the tests exercised. The report is saved
with the pipeline run and can be downloaded from the run's summary page under **Artifacts**.

**If it fails:** Build and Deploy don't run, so code with a broken feature never reaches the server.

### 2b. CodeQL scan

**What it does:** A **security** scan of our own code. GitHub's **CodeQL** tool looks for code that an attacker could
abuse, such as injection or cross-site scripting (XSS). This is called **SAST** (Static Application Security Testing).

**How:** CodeQL builds a database of the code and runs GitHub's library of security checks against it
(`security-extended` set). Results are uploaded to the repo's **Security → Code scanning** page.

**Runs in parallel with Test:** Both only need Lint to pass, so they run at the same time to save time.

**Difference from Test:** Tests check that the code *works*. CodeQL checks that it can't be *misused*.

**If it finds a problem:** On a pull request, GitHub adds a **Code scanning results** check that fails, and the
problem is shown as a comment on the affected line.

### 3. Build

**What it does:** Packages the application into a single file that is ready to deploy, called the
**release artifact** (`release.tar.gz`).

**How:**
1. Installs **only the production packages** (`npm ci --omit=dev`). Testing and linting tools are left out because the server doesn't need them.
2. Creates `build-info.json` with the version, the commit ID, the pipeline run number and the build time.
   This is what the home page shows, so you can see exactly which build is live.
3. Zips `src/`, `node_modules/`, `package.json` and `build-info.json` into `release.tar.gz`.
4. Uploads the file to GitHub so the Deploy stage can use it.

**Why:** "**Build once, deploy many.**" The exact file that was built after the tests passed is the file that goes to
the server. Nothing is rebuilt or changed on the way.

**Waits for:** Both **Test** and **CodeQL scan** must pass first.

### 4. Deploy to EC2

**What it does:** Copies the release artifact to the EC2 server, makes it live, and checks that it works.

**Only runs on `main`:** Pushes to feature branches and pull requests stop after Build. Only code that has been
reviewed and merged into `main` is deployed.

**How:**
1. **Downloads** `release.tar.gz` from the Build stage.
2. **Sets up SSH** using the `EC2_SSH_KEY` secret, so the runner can log in to the server.
3. **Copies** `release.tar.gz` and `deploy/deploy.sh` to the server's `/tmp` folder (`scp`).
4. **Runs `deploy.sh` on the server** (`ssh`), which:
   - unpacks the release into its own folder: `/opt/sdlc-demo/releases/<date>-<commit>/`
   - points the `/opt/sdlc-demo/current` shortcut (symlink) at the new folder
   - restarts the app (`systemctl restart sdlc-demo`)
   - checks `http://127.0.0.1:3000/health` up to 10 times
   - **if the app is not healthy, it switches back to the previous release automatically (rollback)** and fails the stage
   - keeps the 5 newest releases and deletes older ones
5. **Smoke test:** From the GitHub runner, the way a real user would, it calls `http://<EC2_HOST>/health`
   and `http://<EC2_HOST>/api/version`, and checks that the live commit matches the commit that was just built.

**If it fails:** The run is marked as failed in the **Actions** tab. Thanks to the automatic rollback, the previous
working version stays online.
