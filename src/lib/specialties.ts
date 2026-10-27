// Full construction trades list for Algeria — Arabic + French/English.
// `value` is the stable DB key. `ar` is the Arabic label, `fr` the French label.
export interface Specialty {
  value: string;
  ar: string;
  fr: string;
  icon: string;
}

export const SPECIALTIES: Specialty[] = [
  { value: "macon", ar: "بنّاء (ماصون)", fr: "Maçon", icon: "🧱" },
  { value: "coffreur", ar: "كوفراج / نجارة الخرسانة", fr: "Coffreur", icon: "🪵" },
  { value: "ferrailleur", ar: "فيرايور / حداد بناء", fr: "Ferrailleur (Steel Fixer / Rebar)", icon: "⛓️" },
  { value: "couvreur", ar: "كوفرور / تسقيف", fr: "Couvreur (Roofer)", icon: "🏠" },
  { value: "forgeron", ar: "حداد / فورجيرون", fr: "Forgeron (Blacksmith)", icon: "⚒️" },
  { value: "soudeur", ar: "لحّام (سودور)", fr: "Soudeur", icon: "🔥" },
  { value: "electricien", ar: "كهربائي بناء", fr: "Électricien", icon: "⚡" },
  { value: "plombier", ar: "سباك (بلومبي)", fr: "Plombier", icon: "🔧" },
  { value: "peintre", ar: "دهّان (بنتر)", fr: "Peintre", icon: "🎨" },
  { value: "platrier", ar: "بلاطري / جبس", fr: "Plâtrier", icon: "🧰" },
  { value: "carreleur", ar: "مبلّط / رخام وسيراميك", fr: "Carreleur / Marbrier", icon: "🔲" },
  { value: "marbrier", ar: "مرمري / رخام", fr: "Marbrier (Marble)", icon: "💎" },
  { value: "menuisier_bois", ar: "نجار خشب", fr: "Menuisier Bois", icon: "🪚" },
  { value: "menuisier_alu", ar: "تركيب الألمنيوم", fr: "Menuisier Aluminium", icon: "🪟" },
  { value: "vitrier", ar: "زجّاج (فيتري)", fr: "Vitrier (Glazing)", icon: "🪞" },
  { value: "etancheite", ar: "عزل مائي (إيتانشيتي)", fr: "Étanchéité (Waterproofing)", icon: "💧" },
  { value: "climaticien", ar: "تقني تكييف وتبريد (HVAC)", fr: "Climaticien (HVAC)", icon: "❄️" },
  { value: "macon_pierre", ar: "بنّاء حجارة (ماسون حجر)", fr: "Maçon Pierre (Stone Mason)", icon: "🪨" },
  { value: "terrassier", ar: "حفريات وتسوية (تيراسي)", fr: "Terrassier (Excavation)", icon: "🚜" },
  { value: "conducteur_engins", ar: "سائق آلات ثقيلة", fr: "Conducteur d'Engins (Heavy Machinery)", icon: "🏗️" },
  { value: "chauffeur_camion", ar: "سائق شاحنة / نقل مواد", fr: "Chauffeur Camion", icon: "🚚" },
  { value: "geometre", ar: "طبوغرافي / مسّاح", fr: "Géomètre (Surveyor)", icon: "📐" },
  { value: "chef_chantier", ar: "مشرف ورشة (شاف شانتي)", fr: "Chef de Chantier (Site Supervisor)", icon: "🦺" },
  { value: "manoeuvre", ar: "عامل يدوي (مانوفر)", fr: "Manœuvre", icon: "💪" },
  { value: "facadier", ar: "واجهات / لياسة خارجية", fr: "Façadier", icon: "🏢" },
  { value: "staffeur", ar: "ديكور جبسي (ستاف)", fr: "Staffeur", icon: "✨" },
  { value: "pisciniste", ar: "مسابح", fr: "Pisciniste", icon: "🏊" },
  { value: "jardinier_tp", ar: "مساحات خضراء وطرقات", fr: "VRD / Paysagiste", icon: "🌳" },
];

export function specialtyLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const s = SPECIALTIES.find((x) => x.value === value);
  if (!s) return value;
  return `${s.ar} · ${s.fr}`;
}

export function specialtyIcon(value: string | null | undefined): string {
  const s = SPECIALTIES.find((x) => x.value === value);
  return s?.icon ?? "👷";
}
