import { Link } from 'react-router-dom';
import Button from '@/components/Button';
import Card from '@/components/Card';

export default function About() {
  return (
    <div className="min-h-screen bg-dark-400 py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <section className="text-center mb-14">
          <p className="text-brand-500 font-semibold mb-3">Despre TrainerOS</p>
          <h1 className="text-4xl sm:text-5xl font-bold text-white font-display mb-4">
            Construim sistemul care ajută antrenorii să transforme content-ul în clienți.
          </h1>
          <p className="text-gray-300 text-lg max-w-3xl mx-auto">
            TrainerOS a fost creat pentru antrenori fitness care vor consistență, claritate și rezultate reale din
            social media, fără să piardă ore întregi zilnic pe idei și scripturi.
          </p>
        </section>

        <section className="grid md:grid-cols-3 gap-6 mb-12">
          <Card>
            <h2 className="text-xl text-white font-bold mb-2">Misiune</h2>
            <p className="text-gray-300">
              Să oferim fiecărui antrenor un sistem clar de content care atrage clienți potriviți.
            </p>
          </Card>
          <Card>
            <h2 className="text-xl text-white font-bold mb-2">Viziune</h2>
            <p className="text-gray-300">
              O industrie în care profesioniștii din fitness cresc cu strategie, nu prin încercări la întâmplare.
            </p>
          </Card>
          <Card>
            <h2 className="text-xl text-white font-bold mb-2">Valori</h2>
            <p className="text-gray-300">
              Claritate, execuție rapidă, etică în comunicare și rezultate măsurabile.
            </p>
          </Card>
        </section>

        <section className="mb-12">
          <Card>
            <h2 className="text-2xl text-white font-bold mb-4 font-display">Ce face TrainerOS</h2>
            <ul className="space-y-3 text-gray-300">
              <li>• Daily Idea Engine: idei zilnice complete (hook, script, CTA).</li>
              <li>• Niche Finder: clarifică poziționarea și clientul ideal.</li>
              <li>• Content Review AI: analiză înainte de publicare.</li>
            </ul>
          </Card>
        </section>

        <section className="text-center">
          <p className="text-gray-400 mb-4">Vrei să vezi cum funcționează în practică?</p>
          <div className="flex justify-center gap-3">
            <Link to="/features">
              <Button variant="outline">Vezi funcționalitățile</Button>
            </Link>
            <Link to="/register">
              <Button>Începe Free Trial →</Button>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
