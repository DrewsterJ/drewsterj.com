# drewsterj.com

Served by GitHub Pages at <https://drewsterj.com>.

Plain HTML and CSS with no build step: whatever is on `main` is what gets published.

## Files

| File          | Purpose                                              |
| ------------- | ---------------------------------------------------- |
| `index.html`  | Home page, with a showcase card per web game.        |
| `style.css`   | All styling. Colors live in `:root` at the top.      |
| `404.html`    | Shown by GitHub Pages for missing URLs.              |
| `favicon.svg` | Browser tab icon.                                    |
| `CNAME`       | Tells GitHub Pages to serve the site on drewsterj.com. Don't delete it. |

## Preview locally

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## GitHub Pages setup (one time)

1. Repo **Settings → Pages**: Source = *Deploy from a branch*, Branch = `main`, folder = `/ (root)`.
2. Custom domain = `drewsterj.com`, then tick **Enforce HTTPS** once the certificate is issued.
3. At your DNS provider:
   - Apex `drewsterj.com`: four `A` records to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
     (optionally `AAAA` records to `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`).
   - `www`: a `CNAME` record pointing to `drewsterj.github.io`.
