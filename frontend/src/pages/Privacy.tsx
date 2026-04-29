export default function Privacy() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-4xl font-bold text-white mb-4">POLITICA DE CONFIDENȚIALITATE – TRAINEROS</h1>
      <p className="text-gray-400 mb-10">Ultima actualizare: 18 februarie 2026</p>

      <p className="text-gray-300 leading-relaxed mb-10">
        Această Politică de Confidențialitate explică modul în care SWEVEN S.R.L. („Compania”, „noi”, „nostru/noastră”
        sau „TrainerOS”) colectează, utilizează și protejează datele tale cu caracter personal atunci când folosești
        platforma TrainerOS.
      </p>

      <div className="space-y-10 text-gray-300 leading-relaxed">
        <section>
          <h2 className="text-2xl font-semibold text-white mb-3">1. INFORMAȚII DESPRE COMPANIE</h2>
          <p>Operator de date:</p>
          <p className="mt-3">
            <strong>SWEVEN S.R.L.</strong>
            <br />
            Sediu social: Str. Principală, Moisei, Maramureș, România
            <br />
            Număr de înregistrare: J24/1022/2023
            <br />
            CUI: 48485881
            <br />
            Email:{' '}
            <a href="mailto:business@traineros.org" className="text-brand-500">
              business@traineros.org
            </a>
          </p>
          <p className="mt-3">
            Pentru orice întrebare legată de protecția datelor, ne poți contacta la:{' '}
            <a href="mailto:business@traineros.org" className="text-brand-500">
              business@traineros.org
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-3">2. CE DATE COLECTĂM</h2>
          <p>Putem colecta următoarele categorii de date cu caracter personal:</p>

          <h3 className="text-xl font-semibold text-white mt-4 mb-2">2.1 Informații despre cont</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>nume complet;</li>
            <li>adresă de email;</li>
            <li>parolă (criptată);</li>
            <li>țara de facturare;</li>
            <li>informații legate de business pe care le furnizezi voluntar.</li>
          </ul>

          <h3 className="text-xl font-semibold text-white mt-4 mb-2">2.2 Informații de plată</h3>
          <p>Plățile sunt procesate prin Stripe.</p>
          <p>Nu stocăm datele complete ale cardului. Stripe poate colecta:</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>informații despre card;</li>
            <li>adresă de facturare;</li>
            <li>date despre tranzacție.</li>
          </ul>
          <p className="mt-3">Stripe acționează ca operator independent de date.</p>
          <p>
            Poți consulta politica de confidențialitate Stripe aici:{' '}
            <a href="https://stripe.com/privacy" className="text-brand-500" target="_blank" rel="noreferrer">
              https://stripe.com/privacy
            </a>
          </p>

          <h3 className="text-xl font-semibold text-white mt-4 mb-2">2.3 Date de utilizare</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>adresa IP;</li>
            <li>tipul browserului;</li>
            <li>tipul dispozitivului;</li>
            <li>paginile vizitate;</li>
            <li>acțiunile efectuate în platformă;</li>
            <li>momentele de autentificare.</li>
          </ul>

          <h3 className="text-xl font-semibold text-white mt-4 mb-2">2.4 Conținutul utilizatorului</h3>
          <p>
            Orice conținut pe care îl introduci în TrainerOS (text, informații despre nișă, drafturi de content etc.)
            este stocat pentru a putea furniza serviciul.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-3">3. SCOPUL PRELUCRĂRII</h2>
          <p>Prelucrăm datele cu caracter personal în următoarele scopuri:</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>pentru crearea și administrarea conturilor de utilizator;</li>
            <li>pentru oferirea accesului la platformă;</li>
            <li>pentru procesarea plăților aferente abonamentelor;</li>
            <li>pentru îmbunătățirea și optimizarea serviciului;</li>
            <li>pentru comunicarea cu utilizatorii (actualizări de serviciu, suport);</li>
            <li>pentru asigurarea securității platformei;</li>
            <li>pentru respectarea obligațiilor legale.</li>
          </ul>
          <p className="mt-3">Nu vindem date cu caracter personal.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-3">4. TEMEIUL LEGAL AL PRELUCRĂRII (GDPR)</h2>
          <p>În baza Regulamentului General privind Protecția Datelor (GDPR), ne bazăm pe:</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>executarea contractului (pentru furnizarea serviciului);</li>
            <li>obligații legale (contabilitate, fiscalitate);</li>
            <li>interes legitim (securitatea platformei, îmbunătățirea serviciului);</li>
            <li>consimțământ (unde este necesar, de exemplu pentru comunicări de marketing).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-3">5. PERIOADA DE STOCARE A DATELOR</h2>
          <p>Păstrăm datele cu caracter personal:</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>atât timp cât contul este activ;</li>
            <li>atât timp cât este necesar pentru scopuri legale, fiscale sau contabile;</li>
            <li>până la solicitarea ștergerii, sub rezerva obligațiilor legale de păstrare.</li>
          </ul>
          <p className="mt-3">
            După încetarea contului, datele pot fi șterse sau anonimizate, cu excepția cazurilor în care legea impune
            păstrarea lor.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-3">6. PARTAJAREA DATELOR</h2>
          <p>Putem partaja date cu caracter personal cu:</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>Stripe (procesarea plăților);</li>
            <li>furnizori de hosting (infrastructură cloud securizată);</li>
            <li>furnizori de analytics (dacă este cazul);</li>
            <li>autorități legale, atunci când legea o impune.</li>
          </ul>
          <p className="mt-3">Toți furnizorii de servicii sunt obligați prin clauze de confidențialitate și protecție a datelor.</p>
          <p className="mt-3">Nu vindem și nu închiriem date cu caracter personal.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-3">7. TRANSFERURI INTERNAȚIONALE</h2>
          <p>Fiind o companie din UE, prelucrăm în principal datele în Spațiul Economic European (SEE).</p>
          <p className="mt-3">
            Dacă datele sunt transferate în afara SEE (de exemplu prin furnizori de servicii), ne asigurăm că există
            garanții adecvate, cum ar fi:
          </p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>Clauze Contractuale Standard;</li>
            <li>decizii de adecvare;</li>
            <li>acorduri securizate de prelucrare a datelor.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-3">8. SECURITATEA DATELOR</h2>
          <p>Implementăm măsuri tehnice și organizatorice de securitate, inclusiv:</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>conexiuni criptate (HTTPS);</li>
            <li>hashing securizat pentru parole;</li>
            <li>limitarea accesului pe bază de roluri;</li>
            <li>infrastructură de hosting securizată.</li>
          </ul>
          <p className="mt-3">Totuși, niciun sistem nu este 100% sigur.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-3">9. DREPTURILE UTILIZATORULUI (GDPR)</h2>
          <p>Dacă te afli în Uniunea Europeană, ai dreptul să:</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>accesezi datele tale cu caracter personal;</li>
            <li>corectezi date inexacte;</li>
            <li>soliciți ștergerea („dreptul de a fi uitat”);</li>
            <li>restricționezi prelucrarea;</li>
            <li>te opui prelucrării;</li>
            <li>soliciți portabilitatea datelor;</li>
            <li>îți retragi consimțământul (unde este aplicabil);</li>
            <li>depui o plângere la o autoritate de supraveghere.</li>
          </ul>
          <p className="mt-3">
            Pentru exercitarea drepturilor tale, contactează-ne la:{' '}
            <a href="mailto:business@traineros.org" className="text-brand-500">
              business@traineros.org
            </a>
          </p>
          <p className="mt-3">Putem solicita verificarea identității înainte de a soluționa cererile.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-3">10. COMUNICĂRI DE MARKETING</h2>
          <p>Putem trimite emailuri legate de serviciu (de exemplu notificări de plată sau actualizări).</p>
          <p className="mt-3">Emailurile de marketing sunt trimise doar cu consimțământul tău.</p>
          <p>Te poți dezabona în orice moment folosind linkul de dezabonare.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-3">11. COOKIE-URI</h2>
          <p>TrainerOS poate utiliza cookie-uri și tehnologii similare pentru a:</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>menține sesiunile de autentificare;</li>
            <li>îmbunătăți funcționalitatea;</li>
            <li>analiza modul de utilizare.</li>
          </ul>
          <p className="mt-3">Poți controla cookie-urile din setările browserului tău.</p>
          <p>O Politică separată privind Cookie-urile poate oferi detalii suplimentare.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-3">12. DATELE MINORILOR</h2>
          <p>TrainerOS nu este destinat persoanelor cu vârsta sub 18 ani.</p>
          <p className="mt-3">Nu colectăm în mod intenționat date cu caracter personal de la minori.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-3">13. MODIFICĂRI ALE ACESTEI POLITICI</h2>
          <p>Putem actualiza periodic această Politică de Confidențialitate.</p>
          <p className="mt-3">
            Versiunea actualizată va fi publicată pe website, împreună cu o dată revizuită pentru „Ultima actualizare”.
          </p>
          <p className="mt-3">Continuarea utilizării serviciului constituie acceptarea politicii actualizate.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-3">14. CONTACT</h2>
          <p>Pentru întrebări legate de confidențialitate:</p>
          <p className="mt-3">
            Email:{' '}
            <a href="mailto:business@traineros.org" className="text-brand-500">
              business@traineros.org
            </a>
            <br />
            Sediu social: Str. Principală, Moisei, Maramureș, România
          </p>
        </section>
      </div>

      <p className="text-gray-300 leading-relaxed mt-10">
        Prin utilizarea TrainerOS, confirmi că ai citit și ai înțeles această Politică de Confidențialitate.
      </p>
    </div>
  );
}
