#!/usr/bin/env python3
"""Static site generator for tabris.berlin.

Python standard library only. Renders the bilingual one-pager plus the legal
pages into ./public as plain HTML. Run:  python3 tools/build.py
"""
from __future__ import annotations

import hashlib
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
SRC = ROOT / "src" / "pages"

SITE = "https://tabris.berlin"
EMAIL = "info@tabris.berlin"
LEGAL_NAME = "Tabris UG (haftungsbeschränkt)"
STREET = "Plauener Str. 163-165, Haus D/4"
ZIP, CITY = "13053", "Berlin"
YEAR = "2026"
UPDATED = "2026-11-10"

LANGS = ("de", "en")
HOME = {"de": "/", "en": "/en/"}
LEGAL = {
    "imprint": {"de": "/impressum/", "en": "/en/legal-notice/"},
    "privacy": {"de": "/datenschutz/", "en": "/en/privacy-policy/"},
}


def asset(path: str) -> str:
    """Return a cache-busted URL for a file below public/."""
    digest = hashlib.sha256((PUBLIC / path.lstrip("/")).read_bytes()).hexdigest()[:10]
    return f"{path}?v={digest}"


def plain(text: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", text)).strip()


def jsonld(data: dict) -> str:
    body = json.dumps(data, ensure_ascii=False, indent=2).replace("</", "<\\/")
    return f'<script type="application/ld+json">\n{body}\n</script>'


# --------------------------------------------------------------------------
# Icons (inline SVG, stroke based)
# --------------------------------------------------------------------------
ICON_PATHS = {
    "target": '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    "bulb": '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.800 1-2.500A6 6 0 0 0 12 3z"/>',
    "trend": '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    "cap": '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.500V16c2 2 10 2 12 0v-4.500"/><path d="M22 9v6"/>',
    "pulse": '<path d="M20.500 12.500 12 21l-8.500-8.500a5 5 0 0 1 7-7.200L12 6.800l1.500-1.500a5 5 0 0 1 7 7.200z"/><path d="M4.500 12H9l1.500-3 3 6 1.500-3h4.500"/>',
    "leaf": '<path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 15"/><path d="M4 21c2-6 6-10 11-12"/>',
    "apple": '<path d="M12 7c-2-2-7-1.500-7 4.500 0 4 2.500 8.500 5 8.500 1 0 1.300-.5 2-.5s1 .5 2 .5c2.500 0 5-4.500 5-8.500C19 5.500 14 5 12 7z"/><path d="M12 7c0-2 1-3.500 3-4"/>',
    "cup": '<path d="M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h1.500a2.500 2.500 0 0 1 0 5H17"/><path d="M8 3v2M11.500 3v2M15 3v2"/>',
    "paw": '<circle cx="6" cy="11" r="1.800"/><circle cx="10" cy="6.500" r="1.800"/><circle cx="14.500" cy="6.500" r="1.800"/><circle cx="18.500" cy="11" r="1.800"/><path d="M12.200 11c-2.500 0-5 3-5 5.500 0 1.700 1.300 2.500 2.800 2.500 1 0 1.400-.5 2.200-.5s1.200.5 2.200.5c1.500 0 2.800-.8 2.800-2.500 0-2.500-2.500-5.500-5-5.500z"/>',
    "megaphone": '<path d="M3 10v4l3 .5V9.500z"/><path d="M6 9.500 20 5v14L6 14.500"/><path d="M9 15.500V19a2 2 0 0 0 4 0v-2.300"/>',
    "box": '<path d="M12 3l8.500 4.500v9L12 21l-8.500-4.500v-9z"/><path d="M3.500 7.500 12 12l8.500-4.500M12 12v9"/>',
    "pin": '<path d="M12 21s7-6.200 7-11.500A7 7 0 0 0 5 9.500C5 14.800 12 21 12 21z"/><circle cx="12" cy="9.500" r="2.500"/>',
    "mail": '<rect x="3" y="5" width="18" height="14" rx="2.500"/><path d="M3.500 7.500 12 13l8.500-5.500"/>',
    "building": '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16"/><path d="M15 10h4a1 1 0 0 1 1 1v10M2.500 21h19"/><path d="M8 8h3M8 12h3M8 16h3"/>',
    "arrow": '<path d="M4 12h15M13 6l6 6-6 6"/>',
    "external": '<path d="M7 17 17 7M9 7h8v8"/>',
}


def icon(name: str) -> str:
    return (
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
        f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">{ICON_PATHS[name]}</svg>'
    )


def swirl(cls: str) -> str:
    petals = "".join(
        f'<path transform="rotate({a} 100 100)" d="M100 14c24 4 38 28 27 52-9-11-22-17-37-15-7-15-3-30 10-37z"/>'
        for a in range(0, 360, 45)
    )
    return (
        f'<svg class="swirl {cls}" viewBox="0 0 200 200" fill="currentColor" aria-hidden="true" '
        f'focusable="false">{petals}</svg>'
    )


# --------------------------------------------------------------------------
# Content
# --------------------------------------------------------------------------
T = {
    "de": {
        "skip": "Zum Inhalt springen",
        "nav_label": "Hauptnavigation",
        "menu": "Menü",
        "nav": [("about", "Über uns"), ("segments", "Geschäftsfelder"), ("brands", "Marken"),
                ("partners", "Partner &amp; Investoren"), ("careers", "Karriere"), ("faq", "FAQ")],
        "contact": "Kontakt",
        "lang_label": "Sprache",
        "home_title": "Tabris – Holdinggesellschaft aus Berlin | Marken &amp; Portfolio",
        "home_desc": "Tabris – Berliner Holdinggesellschaft hinter acht Marken für Tiergesundheit, Tierernährung, Software, Marketing und Fulfillment. Kontakt für Partner und Investoren.",
        "eyebrow": "Holdinggesellschaft · Berlin · Europa",
        "h1": "Die Berliner Holding hinter starken Marken für <em>Tiergesundheit</em> und <em>E-Commerce</em>.",
        "lead": "Tabris bündelt als Holdinggesellschaft die europäischen Aktivitäten unserer Unternehmensgruppe. "
                "Wir entwickeln Marken und Portfoliounternehmen langfristig – mit strategischen Investitionen, "
                "Innovation und verlässlichen Partnerschaften.",
        "cta1": "Portfolio entdecken",
        "cta2": "Kontakt aufnehmen",
        "facts": [("8", "Marken &amp; Unternehmen", True), ("4", "Geschäftsfelder", True),
                  ("Berlin", "Hauptsitz", False), ("Europa", "Markt", False)],
        "hero_alt": "Weißes Pferd im Galopp vor dunklem Waldrand – Sinnbild für das Tiergesundheits-Portfolio von Tabris",
        "chips": ["Tiergesundheit", "E-Commerce", "Software &amp; Services"],
        "marquee_label": "Marken und Unternehmen der Tabris-Gruppe",
        "about_eyebrow": "Über Tabris",
        "about_h2": "Wachstum fördern, Innovation vorantreiben",
        "about_p": [
            "<strong>Tabris ist eine zukunftsorientierte Holdinggesellschaft mit Sitz in Berlin.</strong> "
            "Unter dem Dach der Tabris UG (haftungsbeschränkt) führen wir die europäischen Aktivitäten unserer "
            "Unternehmensgruppe zusammen – von Wissen und Software für Tiergesundheit über Premium-Tierernährung "
            "bis zu Marketing und Fulfillment.",
            "Unsere Mission als Unternehmensgruppe ist es, langfristiges Wachstum für unsere Portfoliounternehmen "
            "und Marken zu fördern und dabei nachhaltigen Mehrwert für unsere Stakeholder zu schaffen: für Kunden, "
            "Mitarbeitende, Geschäftspartner und Investoren.",
        ],
        "pillars": [
            ("target", "Strategische Vision", "Wir identifizieren Chancen mit hohem Potenzial und entwickeln sie mit klarem, langfristigem Fokus."),
            ("bulb", "Innovationsfokus", "Wir setzen auf moderne Technologien, digitale Geschäftsmodelle und nachhaltige Geschäftspraktiken."),
            ("trend", "Wachstumspartnerschaft", "Wir unterstützen unsere Portfoliounternehmen mit Ressourcen, Expertise und Zugang zu unserem Netzwerk."),
        ],
        "seg_eyebrow": "Geschäftsfelder",
        "seg_h2": "Vier Geschäftsfelder, eine Unternehmensgruppe",
        "seg_lead": "Das Portfolio der Tabris-Holding verbindet Marken für Tierhalter mit den Services, die sie groß machen – "
                    "von der Wissensvermittlung bis zum Versand.",
        "segments": [
            ("Tiergesundheit &amp; Wissen", "Fachwissen, Weiterbildung und Praxissoftware für Pferdehalter, Tierärzte und Therapeuten.", "Sanoanimal · SanoVentis"),
            ("Tierernährung", "Premium-Futtermittel, Bio-Leckerlis und Kräutertees für Pferde sowie Ernährung für Hunde.", "OKAPI · Biostickies · Teepferdchen · KNäX"),
            ("Digitales Marketing", "Datengetriebenes Online-Marketing und Markenaufbau für moderne Unternehmen.", "Influ:ants"),
            ("Produktion &amp; Fulfillment", "Produktion, Logistik und Fulfillment aus einer Hand – End-to-End.", "ONYX"),
        ],
        "brands_eyebrow": "Portfolio",
        "brands_h2": "Unsere Marken und Unternehmen",
        "brands_lead": "Acht Marken und Unternehmen, ein gemeinsames Dach: das Markenportfolio der Tabris-Gruppe im Überblick.",
        "visit": "Website besuchen",
        "visit_aria": "Website von {name} besuchen (öffnet in neuem Tab)",
        "no_site": "Unternehmen der Tabris-Gruppe",
        "partners_eyebrow": "Für Geschäftspartner &amp; Investoren",
        "partners_h2": "Eine Holding, die Marken langfristig entwickelt",
        "partners_lead": "Als Holdinggesellschaft denken wir in Jahren, nicht in Quartalen. Tabris ist Ansprechpartner für "
                         "Geschäftspartner, Lieferanten, Investoren und Medien, die mit unserer Unternehmensgruppe zusammenarbeiten möchten.",
        "partners_cta": "Gespräch anfragen",
        "checks": [
            ("Strategische Steuerung", "Die Holding verantwortet Ausrichtung und Weiterentwicklung des gesamten Marken- und Unternehmensportfolios."),
            ("Gemeinsame Plattform", "Marketing, Software sowie Produktion, Logistik und Fulfillment sind innerhalb der Gruppe verfügbar."),
            ("Fokus auf Tiergesundheit", "Tiefe Branchenkenntnis rund um Pferdegesundheit, Tierernährung und die Arbeit von Tierärzten und Therapeuten."),
            ("Offen für Partnerschaften", "Wir freuen uns über Kooperationen, Vertriebs- und Technologiepartnerschaften in ganz Europa."),
        ],
        "careers_eyebrow": "Karriere",
        "careers_h2": "Karriere bei Tabris in Berlin",
        "careers_lead": "Werden Sie Teil von etwas Außergewöhnlichem. Wir suchen Menschen, die Marken, E-Commerce und digitale Produkte voranbringen.",
        "job_meta": "Berlin, Deutschland · Vollzeit oder Teilzeit",
        "job_tasks": "Ihre Aufgaben",
        "job_profile": "Was wir suchen",
        "apply": "Jetzt bewerben",
        "apply_subject": "Bewerbung",
        "jobs": [
            ("Senior Full Stack Entwickler (m/w/d)",
             "Wir suchen eine hochqualifizierte Persönlichkeit für die Senior-Full-Stack-Entwicklung, die unser Team verstärkt. Sie spielen eine zentrale Rolle beim Aufbau und der Pflege moderner Webanwendungen mit Schwerpunkt auf E-Commerce- und Magento-Entwicklung.",
             ["Leitung von E-Commerce- und Magento-Entwicklungsprojekten", "Architektur und Entwicklung robuster Weblösungen", "Übernahme von Systemadministrationsaufgaben", "Optimierung der Plattform-Performance"],
             ["Tiefgehendes Verständnis von Frontend- und Backend-Technologien", "Leidenschaft für nahtlose Nutzererlebnisse", "Nachweisbare Erfolge im E-Commerce-Bereich", "Freude daran, komplexe Herausforderungen zu meistern"]),
            ("Digital Marketing Manager (m/w/d)",
             "Wir suchen Verstärkung mit Erfahrung in der Digital-Marketing-Strategie, um das Wachstum unseres Markenportfolios voranzutreiben. In dieser praxisorientierten Rolle entwickeln, steuern und optimieren Sie digitale Kampagnen über verschiedene Kanäle hinweg.",
             ["Entwicklung und Umsetzung datengetriebener Digital-Marketing-Strategien", "Erstellung und Optimierung von Kampagnen über mehrere Kanäle", "Analyse von Performance-Daten zur Ableitung künftiger Maßnahmen", "Steigerung von Markenreichweite und Kundenbindung"],
             ["Nachweisbare Erfolge in der Digital-Marketing-Strategie", "Fundiertes Verständnis aktueller Trends und Best Practices", "Leidenschaft für den Aufbau und das Wachstum von Marken im digitalen Raum", "Fähigkeit, messbare und wirkungsvolle Ergebnisse zu erzielen"]),
            ("UI/UX Designer (m/w/d)",
             "Wir suchen Verstärkung mit Erfahrung im UI/UX-Design. Sie gestalten intuitive und ansprechende Nutzererlebnisse für Webanwendungen und mobile Apps und übersetzen gemeinsam mit Produktmanagement und Entwicklung komplexe Anforderungen in nutzerzentrierte Designs.",
             ["Gestaltung intuitiver Benutzeroberflächen für Web und Mobile", "User Research, Wireframes und Prototypen", "Übersetzung komplexer Anforderungen in nutzerzentrierte Designs", "Zusammenarbeit mit interdisziplinären Teams (Produkt, Entwicklung)"],
             ["Aussagekräftiges Portfolio mit Expertise im UI/UX-Design", "Erfahrung in der Gestaltung für Web- und Mobile-Anwendungen", "Fundiertes Verständnis von User Research und Testing-Methoden", "Leidenschaft für schöne, funktionale Designs, die Nutzerprobleme lösen"]),
        ],
        "faq_eyebrow": "Häufige Fragen",
        "faq_h2": "Tabris auf einen Blick",
        "faq": [
            ("Was ist Tabris?",
             "Tabris – rechtlich die Tabris UG (haftungsbeschränkt) – ist eine Holdinggesellschaft mit Sitz in Berlin. Sie bündelt die europäischen Aktivitäten einer Unternehmensgruppe mit Marken und Unternehmen in den Bereichen Tiergesundheit, Tierernährung, Software, digitales Marketing und Fulfillment."),
            ("Welche Marken und Unternehmen gehören zum Portfolio von Tabris?",
             "Zum Portfolio gehören acht Marken und Unternehmen: Sanoanimal (Wissensplattform für Pferdegesundheit), SanoVentis (Therapeuten-Software), OKAPI (Pferdefütterungsprodukte), Biostickies (Bio-Leckerlis für Pferde), Teepferdchen (Kräutertees für Pferde), KNäX (Hundeernährung), Influ:ants (Marketing-Agentur) und ONYX (Produktion, Logistik und Fulfillment)."),
            ("In welchen Geschäftsfeldern ist Tabris tätig?",
             "Tabris ist in vier Geschäftsfeldern aktiv: Tiergesundheit und Wissen, Tierernährung, digitales Marketing sowie Produktion und Fulfillment. Der Schwerpunkt liegt auf Pferdegesundheit und Tierernährung, ergänzt um die digitalen und logistischen Services der Gruppe."),
            ("Wo hat Tabris seinen Sitz?",
             "Der Sitz der Tabris UG (haftungsbeschränkt) ist Plauener Str. 163-165, Haus D/4, 13053 Berlin, Deutschland. Die Gesellschaft ist im Handelsregister des Amtsgerichts Charlottenburg (Berlin) unter HRB 234506 B eingetragen."),
            ("Verkauft Tabris selbst Produkte an Endkunden?",
             "Nein. Tabris ist die Holdinggesellschaft der Gruppe. Produkte und Dienstleistungen werden über die jeweiligen Marken und deren eigene Websites angeboten, zum Beispiel OKAPI, Biostickies, Teepferdchen oder KNäX."),
            ("Wie können Geschäftspartner, Investoren und Medien Kontakt aufnehmen?",
             "Am schnellsten über das Kontaktformular auf dieser Seite oder per E-Mail an info@tabris.berlin. Bitte nennen Sie kurz Ihr Unternehmen und Ihr Anliegen – wir melden uns zeitnah zurück."),
        ],
        "contact_eyebrow": "Kontakt",
        "contact_h2": "Sprechen wir über Ihr Anliegen",
        "contact_lead": "Sie sind Geschäftspartner, Investor oder Medienvertreter? Schreiben Sie uns – wir melden uns zeitnah bei Ihnen.",
        "addr_label": "Anschrift", "mail_label": "E-Mail", "reg_label": "Handelsregister",
        "reg_value": "Amtsgericht Charlottenburg (Berlin), HRB 234506 B",
        "country": "Deutschland",
        "f_name": "Name", "f_company": "Unternehmen", "f_optional": "(optional)", "f_email": "E-Mail",
        "f_topic": "Anliegen", "f_message": "Nachricht", "f_hp": "Bitte dieses Feld leer lassen",
        "topics": [("partnership", "Partnerschaft / Kooperation"), ("investor", "Investoren-Anfrage"),
                   ("press", "Presse / Medien"), ("career", "Karriere"), ("other", "Sonstiges")],
        "f_submit": "Nachricht senden",
        "f_note": 'Ihre Angaben verwenden wir ausschließlich zur Bearbeitung Ihrer Anfrage. Details in der <a href="/datenschutz/">Datenschutzerklärung</a>.',
        "f_noscript": "Für das Kontaktformular wird JavaScript benötigt. Alternativ erreichen Sie uns per E-Mail an",
        "msg_sending": "Nachricht wird gesendet …",
        "msg_ok": "Vielen Dank! Ihre Nachricht wurde gesendet. Wir melden uns zeitnah bei Ihnen.",
        "msg_invalid": "Bitte prüfen Sie Ihre Eingabe.",
        "msg_rate": "Zu viele Anfragen in kurzer Zeit. Bitte versuchen Sie es später erneut oder schreiben Sie uns per E-Mail.",
        "msg_error": "Die Nachricht konnte leider nicht gesendet werden. Bitte schreiben Sie uns per E-Mail an info@tabris.berlin.",
        "footer_claim": "Tabris ist die Berliner Holdinggesellschaft hinter Marken und Unternehmen für Tiergesundheit, Tierernährung und digitale Services.",
        "footer_nav": "Unternehmen", "footer_brands": "Marken", "footer_legal": "Rechtliches",
        "imprint": "Impressum", "privacy": "Datenschutz",
        "rights": "Alle Rechte vorbehalten.",
        "back_home": "Zur Startseite",
        "legal_eyebrow": "Rechtliches",
        "updated": "Stand",
    },
    "en": {
        "skip": "Skip to content",
        "nav_label": "Main navigation",
        "menu": "Menu",
        "nav": [("about", "About"), ("segments", "Business segments"), ("brands", "Brands"),
                ("partners", "Partners &amp; investors"), ("careers", "Careers"), ("faq", "FAQ")],
        "contact": "Contact",
        "lang_label": "Language",
        "home_title": "Tabris – Holding Company in Berlin | Brands &amp; Portfolio",
        "home_desc": "Tabris is the Berlin holding company behind eight brands in animal health, animal nutrition, software, marketing and fulfilment. Contact for partners and investors.",
        "eyebrow": "Holding company · Berlin · Europe",
        "h1": "The Berlin holding company behind strong brands in <em>animal health</em> and <em>e-commerce</em>.",
        "lead": "As a holding company, Tabris brings together the European activities of our group. "
                "We develop brands and portfolio companies for the long term – through strategic investments, "
                "innovation and reliable partnerships.",
        "cta1": "Explore the portfolio",
        "cta2": "Get in touch",
        "facts": [("8", "Brands &amp; companies", True), ("4", "Business segments", True),
                  ("Berlin", "Headquarters", False), ("Europe", "Market", False)],
        "hero_alt": "White horse galloping in front of a dark forest edge – a symbol of the Tabris animal health portfolio",
        "chips": ["Animal health", "E-commerce", "Software &amp; services"],
        "marquee_label": "Brands and companies of the Tabris group",
        "about_eyebrow": "About Tabris",
        "about_h2": "Empowering growth, driving innovation",
        "about_p": [
            "<strong>Tabris is a forward-thinking holding company headquartered in Berlin, Germany.</strong> "
            "Under the roof of Tabris UG (haftungsbeschränkt) we combine the European activities of our group of "
            "companies – from knowledge and software for animal health and premium animal nutrition to marketing "
            "and fulfilment.",
            "Our mission as a group is to foster long-term growth for our portfolio companies and brands while "
            "creating lasting value for our stakeholders: customers, employees, business partners and investors.",
        ],
        "pillars": [
            ("target", "Strategic vision", "We identify high-potential opportunities and develop them with a clear, long-term focus."),
            ("bulb", "Innovation focus", "We embrace modern technology, digital business models and sustainable business practices."),
            ("trend", "Growth partnership", "We support our portfolio companies with resources, expertise and access to our network."),
        ],
        "seg_eyebrow": "Business segments",
        "seg_h2": "Four business segments, one group",
        "seg_lead": "The Tabris portfolio connects brands for animal owners with the services that help them grow – "
                    "from knowledge transfer to shipping.",
        "segments": [
            ("Animal health &amp; knowledge", "Expert knowledge, training and practice software for horse owners, vets and therapists.", "Sanoanimal · SanoVentis"),
            ("Animal nutrition", "Premium feed, organic treats and herbal teas for horses as well as nutrition for dogs.", "OKAPI · Biostickies · Teepferdchen · KNäX"),
            ("Digital marketing", "Data-driven online marketing and brand building for modern businesses.", "Influ:ants"),
            ("Production &amp; fulfilment", "Production, logistics and fulfilment from a single source – end to end.", "ONYX"),
        ],
        "brands_eyebrow": "Portfolio",
        "brands_h2": "Our brands and companies",
        "brands_lead": "Eight brands and companies under one roof: the brand portfolio of the Tabris group at a glance.",
        "visit": "Visit website",
        "visit_aria": "Visit the {name} website (opens in a new tab)",
        "no_site": "Company of the Tabris group",
        "partners_eyebrow": "For business partners &amp; investors",
        "partners_h2": "A holding company that builds brands for the long term",
        "partners_lead": "As a holding company we think in years, not quarters. Tabris is the point of contact for business "
                         "partners, suppliers, investors and media who want to work with our group of companies.",
        "partners_cta": "Request a conversation",
        "checks": [
            ("Strategic management", "The holding company is responsible for the direction and development of the entire portfolio of brands and companies."),
            ("Shared platform", "Marketing, software as well as production, logistics and fulfilment are available within the group."),
            ("Focus on animal health", "Deep sector knowledge in equine health, animal nutrition and the work of vets and therapists."),
            ("Open to partnerships", "We welcome cooperation, distribution and technology partnerships across Europe."),
        ],
        "careers_eyebrow": "Careers",
        "careers_h2": "Careers at Tabris in Berlin",
        "careers_lead": "Be part of something extraordinary. We are looking for people who move brands, e-commerce and digital products forward.",
        "job_meta": "Berlin, Germany · Full-time or part-time",
        "job_tasks": "Key responsibilities",
        "job_profile": "What we're looking for",
        "apply": "Apply now",
        "apply_subject": "Application",
        "jobs": [
            ("Senior Full Stack Developer (m/f/d)",
             "We're looking for a highly skilled Senior Full Stack Developer to join our team. You'll play a key role in building and maintaining modern web applications, with a focus on e-commerce and Magento development.",
             ["Leading e-commerce and Magento development projects", "Architecting and building robust web solutions", "Managing system administration tasks", "Optimising platform performance"],
             ["A deep understanding of both front-end and back-end technologies", "Passion for creating seamless user experiences", "A proven track record of success in e-commerce", "Someone who thrives on solving complex challenges"]),
            ("Digital Marketing Manager (m/f/d)",
             "We're seeking an experienced digital marketing strategist to help drive the growth of our brand portfolio. In this hands-on role you'll develop, execute and optimise digital campaigns across multiple channels.",
             ["Developing and executing data-driven digital marketing strategies", "Creating and optimising campaigns across multiple channels", "Analysing performance data to inform future initiatives", "Driving brand reach and customer engagement"],
             ["A proven track record in digital marketing strategy", "Deep understanding of current trends and best practices", "Passion for building and growing brands in the digital space", "Ability to deliver measurable, impactful results"]),
            ("UI/UX Designer (m/f/d)",
             "We're searching for an experienced UI/UX designer. You'll design intuitive and engaging user experiences for web applications and mobile apps and work closely with product management and development to translate complex requirements into user-centric designs.",
             ["Designing intuitive user interfaces for web and mobile", "Conducting user research, wireframing and prototyping", "Translating complex requirements into user-centric designs", "Collaborating with cross-functional teams (product, development)"],
             ["A strong portfolio showcasing expertise in UI/UX design", "Proven experience in designing for web and mobile applications", "A deep understanding of user research and testing methods", "Passion for beautiful, functional designs that solve user problems"]),
        ],
        "faq_eyebrow": "Frequently asked questions",
        "faq_h2": "Tabris at a glance",
        "faq": [
            ("What is Tabris?",
             "Tabris – legally Tabris UG (haftungsbeschränkt) – is a holding company headquartered in Berlin, Germany. It brings together the European activities of a group of companies with brands and businesses in animal health, animal nutrition, software, digital marketing and fulfilment."),
            ("Which brands and companies belong to the Tabris portfolio?",
             "The portfolio comprises eight brands and companies: Sanoanimal (knowledge platform for equine health), SanoVentis (therapist software), OKAPI (horse feeding products), Biostickies (organic horse treats), Teepferdchen (herbal teas for horses), KNäX (dog nutrition), Influ:ants (marketing agency) and ONYX (production, logistics and fulfilment)."),
            ("Which business segments is Tabris active in?",
             "Tabris is active in four business segments: animal health and knowledge, animal nutrition, digital marketing, and production and fulfilment. The focus is on equine health and animal nutrition, complemented by the group's digital and logistics services."),
            ("Where is Tabris based?",
             "Tabris UG (haftungsbeschränkt) is based at Plauener Str. 163-165, Haus D/4, 13053 Berlin, Germany. The company is registered in the commercial register of the Charlottenburg District Court (Berlin) under HRB 234506 B."),
            ("Does Tabris sell products directly to consumers?",
             "No. Tabris is the group's holding company. Products and services are offered by the individual brands through their own websites, for example OKAPI, Biostickies, Teepferdchen or KNäX."),
            ("How can business partners, investors and media get in touch?",
             "The fastest way is the contact form on this page or an email to info@tabris.berlin. Please briefly mention your company and your request – we will get back to you promptly."),
        ],
        "contact_eyebrow": "Contact",
        "contact_h2": "Let's talk about your request",
        "contact_lead": "Are you a business partner, investor or member of the media? Write to us – we will get back to you promptly.",
        "addr_label": "Address", "mail_label": "Email", "reg_label": "Commercial register",
        "reg_value": "Charlottenburg District Court (Berlin), HRB 234506 B",
        "country": "Germany",
        "f_name": "Name", "f_company": "Company", "f_optional": "(optional)", "f_email": "Email",
        "f_topic": "Subject", "f_message": "Message", "f_hp": "Please leave this field empty",
        "topics": [("partnership", "Partnership / cooperation"), ("investor", "Investor enquiry"),
                   ("press", "Press / media"), ("career", "Careers"), ("other", "Other")],
        "f_submit": "Send message",
        "f_note": 'We use your details solely to process your enquiry. See our <a href="/en/privacy-policy/">privacy policy</a> for details.',
        "f_noscript": "The contact form requires JavaScript. Alternatively, you can reach us by email at",
        "msg_sending": "Sending your message …",
        "msg_ok": "Thank you! Your message has been sent. We will get back to you promptly.",
        "msg_invalid": "Please check your input.",
        "msg_rate": "Too many requests in a short time. Please try again later or send us an email.",
        "msg_error": "Unfortunately your message could not be sent. Please email us at info@tabris.berlin.",
        "footer_claim": "Tabris is the Berlin-based holding company behind brands and companies in animal health, animal nutrition and digital services.",
        "footer_nav": "Company", "footer_brands": "Brands", "footer_legal": "Legal",
        "imprint": "Legal notice", "privacy": "Privacy policy",
        "rights": "All rights reserved.",
        "back_home": "Back to home",
        "legal_eyebrow": "Legal",
        "updated": "Last updated",
    },
}

KNAEX = "https://www." + "knäx".encode("idna").decode() + ".de/"
BRANDS = [
    {"name": "Sanoanimal", "icon": "cap",
     "url": {"de": "https://sanoanimal.de/", "en": "https://sanoanimal.com/"},
     "tag": {"de": "Wissensplattform", "en": "Knowledge platform"},
     "text": {"de": "Bildungs- und Wissensplattform mit Expertenwissen für Pferdehalter, Tierärzte und Therapeuten.",
              "en": "Educational and knowledge platform with expert knowledge for horse owners, vets and therapists."}},
    {"name": "SanoVentis", "icon": "pulse", "url": None,
     "tag": {"de": "Therapeuten-Software", "en": "Therapist software"},
     "text": {"de": "Digitale Lösungen für Pferdetierärzte und Therapeuten – für effiziente Praxisverwaltung und Patientenbetreuung.",
              "en": "Digital solutions for horse vets and therapists to manage practices and patient care efficiently."}},
    {"name": "OKAPI", "icon": "leaf",
     "url": {"de": "https://www.okapi-online.de/", "en": "https://www.okapi-shop.com/"},
     "tag": {"de": "Pferdefütterung", "en": "Horse feeding products"},
     "text": {"de": "Premium-Ernährungslösungen für Gesundheit und Leistungsfähigkeit von Pferden.",
              "en": "Premium nutrition solutions for equine health and performance."}},
    {"name": "Biostickies", "icon": "apple",
     "url": {"de": "https://www.biostickies.com/", "en": "https://www.biostickies.com/"},
     "tag": {"de": "Bio-Leckerlis für Pferde", "en": "Organic horse treats"},
     "text": {"de": "Natürliche Leckerlis in Bio-Qualität für glückliche, gesunde Pferde.",
              "en": "Natural and organic treats for happy, healthy horses."}},
    {"name": "Teepferdchen", "icon": "cup",
     "url": {"de": "https://www.teepferdchen.com/", "en": "https://www.teepferdchen.com/"},
     "tag": {"de": "Kräutertees für Pferde", "en": "Herbal teas for horses"},
     "text": {"de": "Spezielle Kräuterteemischungen für das Wohlbefinden von Pferden.",
              "en": "Specialised herbal tea blends promoting equine wellness."}},
    {"name": "KNäX", "icon": "paw",
     "url": {"de": KNAEX, "en": KNAEX},
     "tag": {"de": "Hundeernährung", "en": "Dog nutrition"},
     "text": {"de": "Premium-BARF-Leckerlis und Kräuterergänzungen für Hunde.",
              "en": "Premium BARF treats and herbal supplements for dogs."}},
    {"name": "Influ:ants", "icon": "megaphone",
     "url": {"de": "https://www.influants.de/", "en": "https://www.influants.de/"},
     "tag": {"de": "Marketing-Agentur", "en": "Marketing agency"},
     "text": {"de": "Innovative digitale Marketinglösungen für moderne Unternehmen.",
              "en": "Innovative digital marketing solutions for modern businesses."}},
    {"name": "ONYX", "icon": "box", "url": None,
     "tag": {"de": "Fulfillment", "en": "Fulfilment company"},
     "text": {"de": "Produktion, Logistik und Fulfillment als End-to-End-Dienstleistung.",
              "en": "End-to-end production, logistics and fulfilment services."}},
]


# --------------------------------------------------------------------------
# Shared layout
# --------------------------------------------------------------------------
def organization(lang: str) -> dict:
    return {
        "@type": "Organization",
        "@id": f"{SITE}/#organization",
        "name": "Tabris",
        "legalName": LEGAL_NAME,
        "alternateName": ["Tabris UG", "Tabris Holding", "Tabris Berlin"],
        "url": f"{SITE}/",
        "logo": {"@type": "ImageObject", "url": f"{SITE}/assets/img/tabris-logo.png", "width": 699, "height": 180},
        "image": f"{SITE}/assets/img/og-tabris.png",
        "description": plain(T[lang]["home_desc"]),
        "email": EMAIL,
        "vatID": "DE349105665",
        "address": {"@type": "PostalAddress", "streetAddress": STREET, "postalCode": ZIP,
                    "addressLocality": CITY, "addressRegion": "Berlin", "addressCountry": "DE"},
        "areaServed": {"@type": "Place", "name": "Europe" if lang == "en" else "Europa"},
        "knowsAbout": (["Holding company", "Brand portfolio management", "Equine health", "Animal nutrition",
                        "Horse feed", "Pet care", "E-commerce", "Veterinary practice software",
                        "Digital marketing", "Fulfilment"] if lang == "en" else
                       ["Holdinggesellschaft", "Markenportfolio", "Pferdegesundheit", "Tierernährung",
                        "Pferdefutter", "Tiergesundheit", "E-Commerce", "Praxissoftware für Tierärzte und Therapeuten",
                        "Digitales Marketing", "Fulfillment"]),
        "contactPoint": {"@type": "ContactPoint", "contactType": "business enquiries" if lang == "en" else "Geschäftsanfragen",
                         "email": EMAIL, "availableLanguage": ["German", "English"]},
        "brand": [
            {"@type": "Brand", "name": b["name"], "description": b["text"][lang],
             **({"url": b["url"][lang]} if b["url"] else {})}
            for b in BRANDS
        ],
    }


def layout(*, lang: str, path: str, alt_path: str, title: str, desc: str, body: str,
           schema: list[dict], robots: str = "index, follow, max-snippet:-1, max-image-preview:large",
           home: bool = False, alternates: bool = True) -> str:
    t = T[lang]
    other = "en" if lang == "de" else "de"
    base = "" if home else HOME[lang]
    nav = "".join(f'<li><a href="{base}#{anchor}">{label}</a></li>' for anchor, label in t["nav"])
    url = SITE + path
    hreflang = ""
    if alternates:
        de_url = SITE + (path if lang == "de" else alt_path)
        en_url = SITE + (path if lang == "en" else alt_path)
        hreflang = (f'<link rel="alternate" hreflang="de" href="{de_url}">\n'
                    f'<link rel="alternate" hreflang="en" href="{en_url}">\n'
                    f'<link rel="alternate" hreflang="x-default" href="{de_url}">\n')
    lang_switch = "".join(
        f'<span aria-current="true" lang="{code}">{code.upper()}</span>' if code == lang else
        f'<a href="{alt_path}" hreflang="{code}" lang="{code}" '
        f'aria-label="{"Deutsch" if code == "de" else "English"}">{code.upper()}</a>'
        for code in LANGS)
    brand_links = "".join(
        f'<li><a href="{b["url"][lang]}" target="_blank" rel="noopener noreferrer">{b["name"]}</a></li>'
        for b in BRANDS if b["url"])
    graph = jsonld({"@context": "https://schema.org", "@graph": schema})
    og_locale = "de_DE" if lang == "de" else "en_GB"
    og_alt = "en_GB" if lang == "de" else "de_DE"
    return f"""<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="robots" content="{robots}">
<link rel="canonical" href="{url}">
{hreflang}<meta name="author" content="{LEGAL_NAME}">
<meta name="theme-color" content="#1d1528">
<meta name="format-detection" content="telephone=no">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Tabris">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="og:locale" content="{og_locale}">
<meta property="og:locale:alternate" content="{og_alt}">
<meta property="og:image" content="{SITE}/assets/img/og-tabris.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Tabris – {'Holdinggesellschaft aus Berlin' if lang == 'de' else 'Holding company in Berlin'}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" href="/assets/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/fraunces-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="{asset('/assets/css/site.css')}">
<script src="{asset('/assets/js/boot.js')}"></script>
<script src="{asset('/assets/js/site.js')}" defer></script>
{graph}
</head>
<body>
<a class="skip-link" href="#main">{t['skip']}</a>
<div class="progress" aria-hidden="true"></div>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="{HOME[lang]}" aria-label="Tabris – {t['back_home']}">
      <picture>
        <source srcset="/assets/img/tabris-logo.webp" type="image/webp">
        <img src="/assets/img/tabris-logo.png" width="699" height="180" alt="Tabris Logo">
      </picture>
    </a>
    <nav class="nav" id="nav" aria-label="{t['nav_label']}">
      <ul>{nav}<li class="nav__mobile-only"><a href="{base}#contact">{t['contact']}</a></li></ul>
    </nav>
    <div class="header-actions">
      <div class="lang" role="group" aria-label="{t['lang_label']}">{lang_switch}</div>
      <a class="btn btn--small" href="{base}#contact">{t['contact']}</a>
      <button class="nav-toggle" type="button" aria-controls="nav" aria-expanded="false" aria-label="{t['menu']}"><span></span></button>
    </div>
  </div>
</header>
<main id="main">
{body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <div class="footer__grid">
      <div class="footer__brand">
        <picture>
          <source srcset="/assets/img/tabris-logo-white.webp" type="image/webp">
          <img src="/assets/img/tabris-logo-white.png" width="699" height="180" alt="Tabris" loading="lazy" decoding="async">
        </picture>
        <p>{t['footer_claim']}</p>
      </div>
      <div>
        <h2>{t['footer_nav']}</h2>
        <ul>{nav}<li><a href="{base}#contact">{t['contact']}</a></li></ul>
      </div>
      <div>
        <h2>{t['footer_brands']}</h2>
        <ul>{brand_links}</ul>
      </div>
      <div>
        <h2>{t['footer_legal']}</h2>
        <ul>
          <li><a href="{LEGAL['imprint'][lang]}">{t['imprint']}</a></li>
          <li><a href="{LEGAL['privacy'][lang]}">{t['privacy']}</a></li>
          <li><a href="mailto:{EMAIL}">{EMAIL}</a></li>
        </ul>
      </div>
    </div>
    <div class="footer__bottom">
      <span>© {YEAR} {LEGAL_NAME}. {t['rights']}</span>
      <span>{STREET}, {ZIP} {CITY}</span>
    </div>
  </div>
</footer>
</body>
</html>
"""


# --------------------------------------------------------------------------
# Home page
# --------------------------------------------------------------------------
def home(lang: str) -> str:
    t = T[lang]
    facts = "".join(
        f'<div class="fact"><dd{f" data-count=\"{value}\"" if count else ""}>{value}</dd><dt>{label}</dt></div>'
        for value, label, count in t["facts"])
    chips = "".join(f'<span class="chip chip--{i}" aria-hidden="true">{c}</span>' for i, c in enumerate(t["chips"], 1))
    names = "".join(f"<li>{b['name']}</li>" for b in BRANDS)
    marquee = (f'<ul class="marquee__group">{names}</ul>'
               f'<ul class="marquee__group" aria-hidden="true">{names}</ul>')
    pillars = "".join(
        f'<article class="pillar" data-reveal="right" data-delay="{i * 110}"><span class="icon">{icon(ic)}</span>'
        f"<h3>{title}</h3><p>{text}</p></article>"
        for i, (ic, title, text) in enumerate(t["pillars"]))
    segments = "".join(
        f'<article class="segment" data-reveal data-delay="{i * 90}"><h3>{title}</h3><p>{text}</p>'
        f'<p class="segment__brands">{brands}</p></article>'
        for i, (title, text, brands) in enumerate(t["segments"]))

    cards = []
    for i, b in enumerate(BRANDS):
        inner = (f'<span class="icon">{icon(b["icon"])}</span><h3>{b["name"]}</h3>'
                 f'<p class="brand-card__tag">{b["tag"][lang]}</p><p>{b["text"][lang]}</p>')
        delay = (i % 4) * 80
        if b["url"]:
            cards.append(
                f'<li data-reveal="zoom" data-delay="{delay}"><a class="brand-card" href="{b["url"][lang]}" target="_blank" '
                f'rel="noopener noreferrer" aria-label="{t["visit_aria"].format(name=b["name"])}">{inner}'
                f'<span class="brand-card__more">{t["visit"]} {icon("external")}</span></a></li>')
        else:
            cards.append(
                f'<li data-reveal="zoom" data-delay="{delay}"><div class="brand-card">{inner}'
                f'<span class="brand-card__more brand-card__more--muted">{t["no_site"]}</span></div></li>')

    checks = "".join(f"<li><div><strong>{a}</strong><span>{b}</span></div></li>" for a, b in t["checks"])

    jobs = []
    for title, intro, tasks, profile in t["jobs"]:
        subject = f"{t['apply_subject']}: {plain(title)}".replace(" ", "%20").replace("/", "%2F")
        jobs.append(
            f"<details><summary><span>{title}<small>{t['job_meta']}</small></span></summary>"
            f'<div class="accordion__body"><p>{intro}</p><h4>{t["job_tasks"]}</h4><ul>'
            + "".join(f"<li>{x}</li>" for x in tasks)
            + f"</ul><h4>{t['job_profile']}</h4><ul>" + "".join(f"<li>{x}</li>" for x in profile)
            + f'</ul><a class="btn btn--small" href="mailto:{EMAIL}?subject={subject}">{t["apply"]} {icon("arrow")}</a>'
            "</div></details>")

    faq = "".join(
        f'<details{" open" if i == 0 else ""}><summary><span>{q}</span></summary>'
        f'<div class="accordion__body"><p>{a}</p></div></details>'
        for i, (q, a) in enumerate(t["faq"]))
    topics = "".join(f'<option value="{k}">{v}</option>' for k, v in t["topics"])

    body = f"""<section class="hero" aria-labelledby="hero-title">
  <div class="hero__bg" aria-hidden="true">
    <span class="blob blob--1"></span><span class="blob blob--2"></span><span class="blob blob--3"></span>
    <span class="hero__grain"></span>
    {swirl('swirl--hero')}
  </div>
  <div class="wrap">
    <div class="hero__text">
      <p class="eyebrow" data-reveal>{t['eyebrow']}</p>
      <h1 id="hero-title" data-reveal data-delay="80">{t['h1']}</h1>
      <p class="hero__lead" data-reveal data-delay="160">{t['lead']}</p>
      <div class="hero__cta" data-reveal data-delay="240">
        <a class="btn btn--light" href="#brands">{t['cta1']} {icon('arrow')}</a>
        <a class="btn btn--ghost" href="#contact">{t['cta2']}</a>
      </div>
      <dl class="hero__facts" data-reveal data-delay="320">{facts}</dl>
    </div>
    <div class="hero__visual" data-reveal="zoom" data-delay="200">
      <div class="hero__frame">
        <picture>
          <source type="image/avif" srcset="/assets/img/hero-horse-800.avif 800w, /assets/img/hero-horse-1400.avif 1400w" sizes="(max-width: 920px) 440px, 38vw">
          <source type="image/webp" srcset="/assets/img/hero-horse-800.webp 800w, /assets/img/hero-horse-1400.webp 1400w" sizes="(max-width: 920px) 440px, 38vw">
          <img src="/assets/img/hero-horse-800.jpg" width="800" height="784" alt="{t['hero_alt']}" fetchpriority="high" decoding="async">
        </picture>
      </div>
      {chips}
    </div>
  </div>
</section>

<div class="marquee" aria-label="{t['marquee_label']}">
  <div class="marquee__track">{marquee}</div>
</div>

<section class="section" id="about" aria-labelledby="about-title">
  <div class="wrap about">
    <div class="about__text" data-reveal="left">
      <p class="eyebrow">{t['about_eyebrow']}</p>
      <h2 id="about-title">{t['about_h2']}</h2>
      <p class="lead">{t['about_p'][0]}</p>
      <p>{t['about_p'][1]}</p>
    </div>
    <div class="pillars">{pillars}</div>
  </div>
</section>

<section class="section section--dark" id="segments" aria-labelledby="segments-title">
  {swirl('swirl--section')}
  <div class="wrap">
    <div class="section__head" data-reveal>
      <p class="eyebrow">{t['seg_eyebrow']}</p>
      <h2 id="segments-title">{t['seg_h2']}</h2>
      <p class="lead">{t['seg_lead']}</p>
    </div>
    <div class="segments">{segments}</div>
  </div>
</section>

<section class="section section--tint" id="brands" aria-labelledby="brands-title">
  <div class="wrap">
    <div class="section__head section__head--center" data-reveal>
      <p class="eyebrow">{t['brands_eyebrow']}</p>
      <h2 id="brands-title">{t['brands_h2']}</h2>
      <p class="lead">{t['brands_lead']}</p>
    </div>
    <ul class="brands">{''.join(cards)}</ul>
  </div>
</section>

<section class="section" id="partners" aria-labelledby="partners-title">
  <div class="wrap partners">
    <div data-reveal="left">
      <p class="eyebrow">{t['partners_eyebrow']}</p>
      <h2 id="partners-title">{t['partners_h2']}</h2>
      <p class="lead">{t['partners_lead']}</p>
      <a class="btn" href="#contact">{t['partners_cta']} {icon('arrow')}</a>
    </div>
    <ul class="checks" data-reveal="right">{checks}</ul>
  </div>
</section>

<section class="section section--tint" id="careers" aria-labelledby="careers-title">
  <div class="wrap">
    <div class="section__head" data-reveal>
      <p class="eyebrow">{t['careers_eyebrow']}</p>
      <h2 id="careers-title">{t['careers_h2']}</h2>
      <p class="lead">{t['careers_lead']}</p>
    </div>
    <div class="accordion" data-reveal>{''.join(jobs)}</div>
  </div>
</section>

<section class="section" id="faq" aria-labelledby="faq-title">
  <div class="wrap">
    <div class="section__head section__head--center" data-reveal>
      <p class="eyebrow">{t['faq_eyebrow']}</p>
      <h2 id="faq-title">{t['faq_h2']}</h2>
    </div>
    <div class="accordion faq" data-reveal>{faq}</div>
  </div>
</section>

<section class="section section--dark" id="contact" aria-labelledby="contact-title">
  <div class="wrap contact">
    <div class="contact__info" data-reveal="left">
      <p class="eyebrow">{t['contact_eyebrow']}</p>
      <h2 id="contact-title">{t['contact_h2']}</h2>
      <p class="lead">{t['contact_lead']}</p>
      <address>
        <div class="contact__row"><span class="icon">{icon('pin')}</span><div><strong>{t['addr_label']}</strong>{LEGAL_NAME}<br>{STREET}<br>{ZIP} {CITY}, {t['country']}</div></div>
        <div class="contact__row"><span class="icon">{icon('mail')}</span><div><strong>{t['mail_label']}</strong><a href="mailto:{EMAIL}">{EMAIL}</a></div></div>
        <div class="contact__row"><span class="icon">{icon('building')}</span><div><strong>{t['reg_label']}</strong>{t['reg_value']}</div></div>
      </address>
    </div>
    <form class="form" id="contact-form" action="/api/contact" method="post" novalidate data-reveal="right"
          data-msg-sending="{t['msg_sending']}" data-msg-ok="{t['msg_ok']}" data-msg-invalid="{t['msg_invalid']}"
          data-msg-rate="{t['msg_rate']}" data-msg-error="{t['msg_error']}">
      <noscript><p class="noscript">{t['f_noscript']} <a href="mailto:{EMAIL}">{EMAIL}</a>.</p></noscript>
      <div class="field">
        <label for="cf-name">{t['f_name']}</label>
        <input id="cf-name" name="name" type="text" autocomplete="name" required minlength="2" maxlength="100" aria-describedby="cf-name-error">
        <span class="field__error" id="cf-name-error" aria-live="polite"></span>
      </div>
      <div class="field">
        <label for="cf-company">{t['f_company']} <span>{t['f_optional']}</span></label>
        <input id="cf-company" name="company" type="text" autocomplete="organization" maxlength="120" aria-describedby="cf-company-error">
        <span class="field__error" id="cf-company-error" aria-live="polite"></span>
      </div>
      <div class="field">
        <label for="cf-email">{t['f_email']}</label>
        <input id="cf-email" name="email" type="email" autocomplete="email" required maxlength="254" aria-describedby="cf-email-error">
        <span class="field__error" id="cf-email-error" aria-live="polite"></span>
      </div>
      <div class="field">
        <label for="cf-topic">{t['f_topic']}</label>
        <select id="cf-topic" name="topic" required aria-describedby="cf-topic-error">{topics}</select>
        <span class="field__error" id="cf-topic-error" aria-live="polite"></span>
      </div>
      <div class="field field--full">
        <label for="cf-message">{t['f_message']}</label>
        <textarea id="cf-message" name="message" required minlength="10" maxlength="5000" aria-describedby="cf-message-error"></textarea>
        <span class="field__error" id="cf-message-error" aria-live="polite"></span>
      </div>
      <div class="hp" aria-hidden="true">
        <label for="cf-website">{t['f_hp']}</label>
        <input id="cf-website" name="website" type="text" tabindex="-1" autocomplete="off">
      </div>
      <div class="form__foot">
        <p class="form__note">{t['f_note']}</p>
        <button class="btn" type="submit">{t['f_submit']} {icon('arrow')}</button>
      </div>
      <p class="form__status" id="form-status" role="status" aria-live="polite"></p>
    </form>
  </div>
</section>"""

    url = SITE + HOME[lang]
    schema = [
        organization(lang),
        {"@type": "WebSite", "@id": f"{SITE}/#website", "url": f"{SITE}/", "name": "Tabris",
         "publisher": {"@id": f"{SITE}/#organization"}, "inLanguage": ["de", "en"]},
        {"@type": "WebPage", "@id": f"{url}#webpage", "url": url, "name": plain(t["home_title"]),
         "description": plain(t["home_desc"]), "inLanguage": lang, "isPartOf": {"@id": f"{SITE}/#website"},
         "about": {"@id": f"{SITE}/#organization"}, "dateModified": UPDATED,
         "primaryImageOfPage": f"{SITE}/assets/img/og-tabris.png"},
        {"@type": "FAQPage", "@id": f"{url}#faq", "inLanguage": lang,
         "mainEntity": [{"@type": "Question", "name": plain(q),
                         "acceptedAnswer": {"@type": "Answer", "text": plain(a)}} for q, a in t["faq"]]},
    ]
    other = "en" if lang == "de" else "de"
    return layout(lang=lang, path=HOME[lang], alt_path=HOME[other], title=t["home_title"],
                  desc=t["home_desc"], body=body, schema=schema, home=True)


# --------------------------------------------------------------------------
# Legal pages
# --------------------------------------------------------------------------
LEGAL_META = {
    ("imprint", "de"): ("Impressum | Tabris UG (haftungsbeschränkt), Berlin",
                        "Impressum der Tabris UG (haftungsbeschränkt), Holdinggesellschaft mit Sitz in Berlin: Anschrift, Vertretung, Handelsregister und Umsatzsteuer-ID.", "Impressum"),
    ("imprint", "en"): ("Legal Notice | Tabris UG (haftungsbeschränkt), Berlin",
                        "Legal notice of Tabris UG (haftungsbeschränkt), holding company based in Berlin: address, management, commercial register and VAT ID.", "Legal notice"),
    ("privacy", "de"): ("Datenschutzerklärung | Tabris",
                        "Datenschutzerklärung der Tabris UG (haftungsbeschränkt): Informationen zur Verarbeitung personenbezogener Daten auf tabris.berlin.", "Datenschutzerklärung"),
    ("privacy", "en"): ("Privacy Policy | Tabris",
                        "Privacy policy of Tabris UG (haftungsbeschränkt): information on the processing of personal data on tabris.berlin.", "Privacy policy"),
}


def legal(kind: str, lang: str) -> str:
    t = T[lang]
    other = "en" if lang == "de" else "de"
    title, desc, h1 = LEGAL_META[(kind, lang)]
    content = (SRC / f"{kind}.{lang}.html").read_text(encoding="utf-8")
    path = LEGAL[kind][lang]
    body = f"""<section class="page-hero">
  {swirl('swirl--hero')}
  <div class="wrap">
    <p class="eyebrow">{t['legal_eyebrow']}</p>
    <h1>{h1}</h1>
    <p>{LEGAL_NAME} · {t['updated']}: {'10.11.2026' if lang == 'de' else '10 November 2026'}</p>
  </div>
</section>
<div class="wrap"><div class="prose">
{content}
</div></div>"""
    url = SITE + path
    schema = [
        organization(lang),
        {"@type": "WebPage", "@id": f"{url}#webpage", "url": url, "name": plain(title), "inLanguage": lang,
         "isPartOf": {"@id": f"{SITE}/#website"}, "dateModified": UPDATED},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Tabris", "item": SITE + HOME[lang]},
            {"@type": "ListItem", "position": 2, "name": h1, "item": url}]},
    ]
    robots = "index, follow" if kind == "imprint" else "noindex, follow"
    return layout(lang=lang, path=path, alt_path=LEGAL[kind][other], title=title, desc=desc,
                  body=body, schema=schema, robots=robots)


def not_found() -> str:
    body = """<section class="error-page">
  <div class="wrap">
    <p class="code">404</p>
    <h1>Seite nicht gefunden</h1>
    <p lang="en">Page not found</p>
    <p><a class="btn" href="/">Zur Startseite</a> <a class="btn" href="/en/" lang="en">Back to home</a></p>
  </div>
</section>"""
    return layout(lang="de", path="/404.html", alt_path="/en/", title="Seite nicht gefunden | Tabris",
                  desc="Die angeforderte Seite wurde nicht gefunden.", body=body,
                  schema=[organization("de")], robots="noindex, follow", alternates=False)


# --------------------------------------------------------------------------
# Auxiliary files
# --------------------------------------------------------------------------
def sitemap() -> str:
    groups = [HOME, LEGAL["imprint"], LEGAL["privacy"]]
    rows = []
    for group in groups:
        for lang in LANGS:
            links = "".join(
                f'\n    <xhtml:link rel="alternate" hreflang="{code}" href="{SITE}{group[code]}"/>' for code in LANGS)
            links += f'\n    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE}{group["de"]}"/>'
            rows.append(f"  <url>\n    <loc>{SITE}{group[lang]}</loc>\n    <lastmod>{UPDATED}</lastmod>{links}\n  </url>")
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
            'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + "\n".join(rows) + "\n</urlset>\n")


ROBOTS = f"""# tabris.berlin – all crawlers welcome, including AI / answer-engine crawlers.
User-agent: *
Allow: /
Disallow: /api/

User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: ClaudeBot
User-agent: Claude-SearchBot
User-agent: Claude-User
User-agent: PerplexityBot
User-agent: Perplexity-User
User-agent: Google-Extended
User-agent: Applebot-Extended
User-agent: Bingbot
User-agent: CCBot
Allow: /
Disallow: /api/

Sitemap: {SITE}/sitemap.xml
"""


def llms_txt() -> str:
    en, de = T["en"], T["de"]
    brands = "\n".join(
        f"- {'[' + b['name'] + '](' + b['url']['en'] + ')' if b['url'] else b['name']}: "
        f"{b['tag']['en']} – {b['text']['en']}" for b in BRANDS)
    faq = "\n\n".join(f"### {plain(q)}\n{plain(a)}" for q, a in en["faq"])
    segs = "\n".join(f"- {plain(a)}: {plain(b)} ({c})" for a, b, c in en["segments"])
    return f"""# Tabris

> {plain(en['home_desc'])}

Tabris ({LEGAL_NAME}) is a holding company headquartered in Berlin, Germany. It brings together the
European activities of a group of companies. Tabris itself does not sell products to consumers; products and
services are offered by the individual brands.

## Key facts

- Legal name: {LEGAL_NAME}
- Type: Holding company (Holdinggesellschaft)
- Headquarters: {STREET}, {ZIP} {CITY}, Germany
- Commercial register: Amtsgericht Charlottenburg (Berlin), HRB 234506 B
- VAT ID: DE349105665
- Managing director: Dr. Christina Fritz
- Contact: {EMAIL}
- Languages: German, English
- Market: Europe

## Business segments

{segs}

## Brands and companies

{brands}

## Frequently asked questions

{faq}

## Pages

- [Tabris – Startseite (Deutsch)]({SITE}/): {plain(de['home_desc'])}
- [Tabris – Home (English)]({SITE}/en/): {plain(en['home_desc'])}
- [Impressum]({SITE}/impressum/): Legal notice (German)
- [Legal notice]({SITE}/en/legal-notice/): Legal notice (English)
- [Datenschutzerklärung]({SITE}/datenschutz/): Privacy policy (German)
- [Privacy policy]({SITE}/en/privacy-policy/): Privacy policy (English)
"""


SECURITY_TXT = f"""Contact: mailto:{EMAIL}
Expires: 2027-11-01T00:00:00.000Z
Preferred-Languages: de, en
Canonical: {SITE}/.well-known/security.txt
"""

MANIFEST = {
    "name": "Tabris", "short_name": "Tabris", "start_url": "/", "display": "browser",
    "background_color": "#ffffff", "theme_color": "#1d1528",
    "icons": [{"src": "/assets/img/icon-192.png", "sizes": "192x192", "type": "image/png"},
              {"src": "/assets/img/icon-512.png", "sizes": "512x512", "type": "image/png"}],
}


def write(path: str, content: str) -> None:
    target = PUBLIC / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8", newline="\n")
    print(f"  {path}  ({len(content.encode()):,} bytes)")


def main() -> None:
    print("Building tabris.berlin →", PUBLIC)
    write("index.html", home("de"))
    write("en/index.html", home("en"))
    for kind in LEGAL:
        for lang in LANGS:
            write(LEGAL[kind][lang].strip("/") + "/index.html", legal(kind, lang))
    write("404.html", not_found())
    write("sitemap.xml", sitemap())
    write("robots.txt", ROBOTS)
    write("llms.txt", llms_txt())
    write(".well-known/security.txt", SECURITY_TXT)
    write("site.webmanifest", json.dumps(MANIFEST, indent=2) + "\n")


if __name__ == "__main__":
    main()
