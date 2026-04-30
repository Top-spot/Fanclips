# Connect to GitHub and deploy (new app)

## 1. Connect to your new GitHub repo

Create a new repository on GitHub (empty: no README, .gitignore, or license). Then run (replace with your repo URL):

```powershell
# From this project folder
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
# If you already had an origin:  git remote set-url origin <url>

git push -u origin main
```

(Use `master` instead of `main` if that’s your default branch.)

---

## 2. Host the app (launch very soon)

| Option | Why it’s good |
|--------|----------------|
| **Vercel** | Connect GitHub → auto-deploys on push; free tier; minimal config. |
| **Netlify** | Same: connect repo, auto-build and deploy; free tier. |
| **Cloudflare Pages** | Git integration, fast CDN; free tier. |

- **Vercel:** [vercel.com](https://vercel.com) → Sign in with GitHub → Add New Project → select your repo → set build command/output if needed → Deploy.
- **Netlify:** [netlify.com](https://netlify.com) → Add new site → Import from Git → choose repo → set build (e.g. `npm run build`, publish `dist` for Vite) → Deploy.

**Build settings** (set when you add the project):

- **Vite / Create React App:** build `npm run build`, output `dist`
- **Next.js:** usually auto-detected; output `.next` or static `out` if exported
- **Plain HTML/JS:** no build; publish the folder with `index.html`

Add any environment variables in the host’s project settings.

---

## 3. Order of operations

1. Add your new app code to this folder.
2. Commit: `git add .` then `git commit -m "Initial commit: new app"`.
3. Add remote and push (see step 1).
4. In Vercel or Netlify, import the repo and deploy.
5. Use the provided URL to launch.
