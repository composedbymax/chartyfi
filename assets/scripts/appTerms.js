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
  overlay.id = 'terms-overlay';
  overlay.innerHTML = `
<div id="terms-box">
  <p>Please review and visit the following links to continue:</p>
  <a id="terms-link" href="${TERMS_URL}" target="_blank" rel="noopener">Terms of Service</a>
  <a id="privacy-link" href="${PRIVACY_URL}" target="_blank" rel="noopener">Privacy Policy</a>
</div>`;
  document.body.appendChild(overlay);
  const termsLink = overlay.querySelector('#terms-link');
  const privacyLink = overlay.querySelector('#privacy-link');
  if (termsVisited) termsLink.classList.add('visited');
  if (privacyVisited) privacyLink.classList.add('visited');
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
    el.classList.add('visited');
    checkDone();
  };
  termsLink.addEventListener('click', () => markVisited('terms', termsLink));
  termsLink.addEventListener('auxclick', e => { if (e.button === 1) markVisited('terms', termsLink); });
  privacyLink.addEventListener('click', () => markVisited('privacy', privacyLink));
  privacyLink.addEventListener('auxclick', e => { if (e.button === 1) markVisited('privacy', privacyLink); });
}