import {storage} from './storage.js';
import {setGuardBypass} from './appGuard.js';
const TERMS_URL = 'https://vault.x10.mx/terms';
const PRIVACY_URL = 'https://vault.x10.mx/privacy-policy';
export function acceptTerms() {
  if (storage.getAcceptTerms()) return;
  setGuardBypass(true);
  let termsVisited = storage.getTermsVisited?.() || false;
  let privacyVisited = storage.getPrivacyVisited?.() || false;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay text-14';
  overlay.innerHTML = `
<div class="bg-3 rounded p-28-16 text-center flex flex-col gap-8 text-15">
  <p>Please review and visit the following links to continue:</p>
  <a id="terms-link" class="text-accent" href="${TERMS_URL}" target="_blank" rel="noopener">Terms of Service</a>
  <a id="privacy-link" class="text-accent" href="${PRIVACY_URL}" target="_blank" rel="noopener">Privacy Policy</a>
</div>`;
  document.body.appendChild(overlay);
  const termsLink = overlay.querySelector('#terms-link');
  const privacyLink = overlay.querySelector('#privacy-link');
  if (termsVisited) termsLink.classList.replace('text-accent', 'text-pos');
  if (privacyVisited) privacyLink.classList.replace('text-accent', 'text-pos');
  const checkDone = () => {
    if (termsVisited && privacyVisited) {
      storage.setAcceptTerms(true);
      setGuardBypass(false);
      overlay.remove();
    }
  };
  checkDone();
  const markVisited = (which, el) => {
    if (which === 'terms') { termsVisited = true; storage.setTermsVisited(true); }
    else { privacyVisited = true; storage.setPrivacyVisited(true); }
    el.classList.replace('text-accent', 'text-pos');
    checkDone();
  };
  termsLink.addEventListener('click', () => markVisited('terms', termsLink));
  termsLink.addEventListener('auxclick', e => { if (e.button === 1) markVisited('terms', termsLink); });
  privacyLink.addEventListener('click', () => markVisited('privacy', privacyLink));
  privacyLink.addEventListener('auxclick', e => { if (e.button === 1) markVisited('privacy', privacyLink); });
}