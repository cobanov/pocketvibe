// What every page of the site has: copy buttons, and the newest version and
// size on the download links (public/releases.json, written by the build).

for (const button of document.querySelectorAll('.copy')) {
  button.addEventListener('click', async () => {
    await navigator.clipboard.writeText(button.previousElementSibling.textContent.trim());
    button.textContent = 'Copied';
    setTimeout(() => (button.textContent = 'Copy'), 1500);
  });
}

fetch('/releases.json')
  .then((res) => (res.ok ? res.json() : null))
  .then((releases) => {
    for (const el of document.querySelectorAll('[data-release]')) {
      const release = releases?.[el.dataset.release];
      if (release) el.textContent = `${release.version}, ${(release.size / 1e6).toFixed(1)} MB`;
    }
  })
  .catch(() => {
    // The links still work; they just say "newest version".
  });
