// The small script that goes on the website (www.monarchi.agency). It listens to the contact form and sends a COPY of every submission to the
// CRM; the site's own form handler keeps working exactly as before (nothing is replaced, and a failure of the copy is silent).
// The key it carries is public by nature (anyone can read a page's scripts): it keeps random noise out, the real guards are on the server.
export function buildSnippet({ endpoint, key, selector = 'form.contact-section__form' }) {
  return `<script>
/* Mon'Archi CRM: a copy of the website form submissions goes to the CRM (a new contact + deal, a Telegram message) */
(function () {
  var ENDPOINT = ${JSON.stringify(endpoint)};
  var KEY = ${JSON.stringify(key)};
  var SELECTOR = ${JSON.stringify(selector)};

  // UTM labels are remembered for the visit, so the form on a later page still knows where the visitor came from
  function utm() {
    var out = {};
    try {
      var q = new URLSearchParams(location.search);
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function (k) {
        if (q.get(k)) sessionStorage.setItem('crm_' + k, q.get(k));
        if (sessionStorage.getItem('crm_' + k)) out[k] = sessionStorage.getItem('crm_' + k);
      });
    } catch (e) {}
    return out;
  }

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.matches || !form.matches(SELECTOR)) return;
    try {
      var data = { key: KEY, form: 'contact', services: [], page_url: location.href, referrer: document.referrer, utm: utm() };
      new FormData(form).forEach(function (value, name) {
        if (name === 'services[]') {
          // the visible text of the ticked service (Google Ads, SEO...), the value is only service1..service6
          var box = form.querySelector('input[name="services[]"][value="' + value + '"]');
          var label = box && box.closest('label') ? box.closest('label').textContent.replace(/\\s+/g, ' ').trim() : value;
          data.services.push(label || value);
        } else if (typeof value === 'string' && name !== 'action') {
          data[name] = value;
        }
      });
      var body = JSON.stringify(data);
      // text/plain keeps this a "simple" cross-site request (no preflight), and sendBeacon survives the page being left right after the click
      if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }));
      else fetch(ENDPOINT, { method: 'POST', body: body, headers: { 'Content-Type': 'text/plain' }, keepalive: true, mode: 'cors' });
    } catch (err) {}
  }, true);
})();
</script>`;
}
