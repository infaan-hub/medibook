/**
 * Patient-facing translations for the specialty catalog.
 *
 * The specialty rows live in the database and are served in English. This
 * module maps those canonical English names to Swahili, French, Spanish and
 * German so the same catalog follows the active UI language without changing
 * the admin-managed records. Unknown or newly-created specialties simply fall
 * back to the English API content.
 */
import { normalizeLanguage } from "../i18n";

type SpecialtyFields = {
  name: string;
  patient_friendly_name: string;
  description: string;
  what_to_expect: string;
};

type TranslationLanguage = "sw" | "fr" | "es" | "de";

const TRANSLATIONS: Record<
  string,
  Record<TranslationLanguage, SpecialtyFields>
> = {
  cardiology: {
    sw: {
      name: "Kadiolojia",
      patient_friendly_name: "Mtaalamu wa moyo",
      description:
        "Uchunguzi na matibabu ya magonjwa ya moyo na mfumo wa damu.",
      what_to_expect: "ECG, echokadiogramu na mapitio ya dawa.",
    },
    fr: {
      name: "Cardiologie",
      patient_friendly_name: "Spécialiste du cœur",
      description:
        "Diagnostic et traitement des maladies du cœur et du système cardiovasculaire.",
      what_to_expect:
        "ECG, échocardiogramme et révision des médicaments.",
    },
    es: {
      name: "Cardiología",
      patient_friendly_name: "Especialista del corazón",
      description:
        "Diagnóstico y tratamiento de enfermedades del corazón y del sistema cardiovascular.",
      what_to_expect: "ECG, ecocardiograma y revisión de medicamentos.",
    },
    de: {
      name: "Kardiologie",
      patient_friendly_name: "Herzspezialist",
      description:
        "Diagnose und Behandlung von Herz- und Herz-Kreislauf-Erkrankungen.",
      what_to_expect: "EKG, Echokardiogramm und Medikamentenüberprüfung.",
    },
  },
  dermatology: {
    sw: {
      name: "Dermatolojia",
      patient_friendly_name: "Mtaalamu wa ngozi",
      description: "Huduma ya ngozi, nywele na kucha.",
      what_to_expect: "Uchunguzi wa ngozi na huenda biopsy.",
    },
    fr: {
      name: "Dermatologie",
      patient_friendly_name: "Spécialiste de la peau",
      description: "Soins de la peau, des cheveux et des ongles.",
      what_to_expect: "Examen de la peau et biopsie éventuelle.",
    },
    es: {
      name: "Dermatología",
      patient_friendly_name: "Especialista de la piel",
      description: "Atención de la piel, el cabello y las uñas.",
      what_to_expect: "Examen de la piel y posible biopsia.",
    },
    de: {
      name: "Dermatologie",
      patient_friendly_name: "Hautspezialist",
      description: "Pflege von Haut, Haaren und Nägeln.",
      what_to_expect: "Hautuntersuchung und mögliche Biopsie.",
    },
  },
  pediatrics: {
    sw: {
      name: "Pediatriki",
      patient_friendly_name: "Afya ya watoto",
      description:
        "Huduma ya matibabu kwa watoto wachanga, watoto na vijana.",
      what_to_expect:
        "Vipimo vya ukuaji, chanjo na uchunguzi wa ukuaji.",
    },
    fr: {
      name: "Pédiatrie",
      patient_friendly_name: "Santé de l'enfant",
      description:
        "Soins médicaux pour les nourrissons, les enfants et les adolescents.",
      what_to_expect:
        "Contrôles de croissance, vaccins et dépistage du développement.",
    },
    es: {
      name: "Pediatría",
      patient_friendly_name: "Salud infantil",
      description:
        "Atención médica para bebés, niños y adolescentes.",
      what_to_expect:
        "Controles de crecimiento, vacunas y evaluación del desarrollo.",
    },
    de: {
      name: "Pädiatrie",
      patient_friendly_name: "Kindergesundheit",
      description:
        "Medizinische Versorgung von Säuglingen, Kindern und Jugendlichen.",
      what_to_expect:
        "Wachstumskontrollen, Impfungen und Entwicklungsuntersuchungen.",
    },
  },
  "general practice": {
    sw: {
      name: "Tiba ya Jumla",
      patient_friendly_name: "Daktari wa familia",
      description: "Huduma ya kwanza na endelevu ya afya ya msingi.",
      what_to_expect: "Historia, uchunguzi wa mwili na mpango wa huduma.",
    },
    fr: {
      name: "Médecine générale",
      patient_friendly_name: "Médecin de famille",
      description: "Soins primaires de premier contact et de suivi.",
      what_to_expect: "Anamnèse, examen physique et plan de soins.",
    },
    es: {
      name: "Medicina general",
      patient_friendly_name: "Médico de familia",
      description: "Atención primaria de primer contacto y continua.",
      what_to_expect: "Historia clínica, examen físico y plan de atención.",
    },
    de: {
      name: "Allgemeinmedizin",
      patient_friendly_name: "Hausarzt",
      description:
        "Erstkontakt und kontinuierliche hausärztliche Versorgung.",
      what_to_expect:
        "Anamnese, körperliche Untersuchung und Behandlungsplan.",
    },
  },
  "general practitioner": {
    sw: {
      name: "Daktari wa Jumla",
      patient_friendly_name: "Daktari wa jumla",
      description:
        "Huduma ya kwanza kwa magonjwa ya kawaida na matatizo ya afya ya kila siku.",
      what_to_expect:
        "Historia, uchunguzi wa mwili na vipimo vya msingi au rufaa ikihitajika.",
    },
    fr: {
      name: "Médecin généraliste",
      patient_friendly_name: "Médecin généraliste",
      description:
        "Soins de premier contact pour les maladies courantes et les problèmes de santé quotidiens.",
      what_to_expect:
        "Anamnèse, examen physique et tests de base ou orientation si nécessaire.",
    },
    es: {
      name: "Médico general",
      patient_friendly_name: "Médico general",
      description:
        "Atención de primer contacto para enfermedades comunes y problemas de salud cotidianos.",
      what_to_expect:
        "Historia clínica, examen físico y pruebas básicas o derivación si es necesario.",
    },
    de: {
      name: "Facharzt für Allgemeinmedizin",
      patient_friendly_name: "Allgemeinarzt",
      description:
        "Erstversorgung bei häufigen Krankheiten und alltäglichen Gesundheitsproblemen.",
      what_to_expect:
        "Anamnese, körperliche Untersuchung und Basisuntersuchungen oder Überweisung bei Bedarf.",
    },
  },
  "family medicine": {
    sw: {
      name: "Tiba ya Familia",
      patient_friendly_name: "Huduma ya familia nzima",
      description:
        "Huduma endelevu kwa kila mwanafamilia, kutoka watoto hadi wazee.",
      what_to_expect:
        "Vipimo vya afya, ufuatiliaji wa magonjwa sugu na ushauri wa kinga.",
    },
    fr: {
      name: "Médecine familiale",
      patient_friendly_name: "Soins pour toute la famille",
      description:
        "Soins continus pour chaque membre de la famille, des enfants aux personnes âgées.",
      what_to_expect:
        "Bilans de santé, suivi des maladies chroniques et conseils de prévention.",
    },
    es: {
      name: "Medicina familiar",
      patient_friendly_name: "Atención para toda la familia",
      description:
        "Atención continua para cada miembro de la familia, desde niños hasta adultos mayores.",
      what_to_expect:
        "Chequeos, seguimiento de enfermedades crónicas y consejos de prevención.",
    },
    de: {
      name: "Familienmedizin",
      patient_friendly_name: "Betreuung der ganzen Familie",
      description:
        "Kontinuierliche Betreuung jedes Familienmitglieds, von Kindern bis zu älteren Erwachsenen.",
      what_to_expect:
        "Vorsorgeuntersuchungen, Nachsorge chronischer Krankheiten und Präventionsberatung.",
    },
  },
  "internal medicine": {
    sw: {
      name: "Tiba ya Watu Wazima",
      patient_friendly_name: "Tiba ya watu wazima",
      description:
        "Uchunguzi na udhibiti wa magonjwa ya watu wazima na hali ngumu za ndani.",
      what_to_expect:
        "Historia ya kina, uchunguzi na vipimo vya maabara.",
    },
    fr: {
      name: "Médecine interne",
      patient_friendly_name: "Médecine pour adultes",
      description:
        "Diagnostic et prise en charge des maladies de l'adulte et des affections internes complexes.",
      what_to_expect:
        "Anamnèse détaillée, examen et bilan de laboratoire.",
    },
    es: {
      name: "Medicina interna",
      patient_friendly_name: "Medicina para adultos",
      description:
        "Diagnóstico y manejo de enfermedades del adulto y afecciones internas complejas.",
      what_to_expect:
        "Historia detallada, examen y estudios de laboratorio.",
    },
    de: {
      name: "Innere Medizin",
      patient_friendly_name: "Erwachsenenmedizin",
      description:
        "Diagnose und Behandlung von Erkrankungen des Erwachsenen und komplexen inneren Erkrankungen.",
      what_to_expect:
        "Ausführliche Anamnese, Untersuchung und Laborabklärung.",
    },
  },
  gynecology: {
    sw: {
      name: "Jinekologia",
      patient_friendly_name: "Afya ya wanawake",
      description:
        "Huduma ya mfumo wa uzazi wa mwanamke na afya ya wanawake katika kila umri.",
      what_to_expect:
        "Ushauri, uchunguzi na ultrasound au uchunguzi wa kinga inapohitajika.",
    },
    fr: {
      name: "Gynécologie",
      patient_friendly_name: "Santé des femmes",
      description:
        "Soins du système reproducteur féminin et de la santé des femmes à tout âge.",
      what_to_expect:
        "Consultation, examen et échographie ou dépistage selon les besoins.",
    },
    es: {
      name: "Ginecología",
      patient_friendly_name: "Salud de la mujer",
      description:
        "Atención del sistema reproductor femenino y la salud de la mujer en todas las edades.",
      what_to_expect:
        "Consulta, examen y ecografía o cribado según sea necesario.",
    },
    de: {
      name: "Gynäkologie",
      patient_friendly_name: "Frauengesundheit",
      description:
        "Versorgung des weiblichen Fortpflanzungssystems und der Frauengesundheit in jedem Alter.",
      what_to_expect:
        "Beratung, Untersuchung und Ultraschall oder Screening nach Bedarf.",
    },
  },
  obstetrics: {
    sw: {
      name: "Uzazi",
      patient_friendly_name: "Ujauzito na kujifungua",
      description:
        "Huduma wakati wa ujauzito, kujifungua na kipindi cha baada ya kujifungua.",
      what_to_expect:
        "Ziara za wajawazito, skana na mipango ya kujifungua.",
    },
    fr: {
      name: "Obstétrique",
      patient_friendly_name: "Grossesse et accouchement",
      description:
        "Soins pendant la grossesse, l'accouchement et la période postnatale.",
      what_to_expect:
        "Visites prénatales, échographies et planification de l'accouchement.",
    },
    es: {
      name: "Obstetricia",
      patient_friendly_name: "Embarazo y parto",
      description:
        "Atención durante el embarazo, el parto y el período posnatal.",
      what_to_expect:
        "Visitas prenatales, ecografías y planificación del parto.",
    },
    de: {
      name: "Geburtshilfe",
      patient_friendly_name: "Schwangerschaft und Geburt",
      description:
        "Betreuung während Schwangerschaft, Geburt und Wochenbett.",
      what_to_expect:
        "Vorsorgeuntersuchungen in der Schwangerschaft, Scans und Geburtsplanung.",
    },
  },
  neurology: {
    sw: {
      name: "Neorolojia",
      patient_friendly_name: "Mtaalamu wa ubongo na neva",
      description:
        "Huduma ya ubongo, uti wa mgongo na mfumo wa neva, ikiwa ni pamoja na kiharusi na kifafa.",
      what_to_expect:
        "Uchunguzi wa neva na picha au vipimo vya neva ikihitajika.",
    },
    fr: {
      name: "Neurologie",
      patient_friendly_name: "Spécialiste du cerveau et des nerfs",
      description:
        "Soins du cerveau, de la moelle épinière et du système nerveux, y compris les accidents vasculaires cérébraux et les crises d'épilepsie.",
      what_to_expect:
        "Examen neurologique et imagerie ou études nerveuses si nécessaire.",
    },
    es: {
      name: "Neurología",
      patient_friendly_name: "Especialista del cerebro y los nervios",
      description:
        "Atención del cerebro, la médula espinal y el sistema nervioso, incluidos accidentes cerebrovasculares y convulsiones.",
      what_to_expect:
        "Examen neurológico y pruebas de imagen o estudios nerviosos si es necesario.",
    },
    de: {
      name: "Neurologie",
      patient_friendly_name: "Spezialist für Gehirn und Nerven",
      description:
        "Versorgung von Gehirn, Wirbelsäule und Nervensystem, einschließlich Schlaganfall und Anfällen.",
      what_to_expect:
        "Neurologische Untersuchung und Bildgebung oder Nervenuntersuchungen bei Bedarf.",
    },
  },
  gastroenterology: {
    sw: {
      name: "Gastroenterolojia",
      patient_friendly_name: "Afya ya mmeng'enyo",
      description:
        "Huduma ya mfumo wa mmeng'enyo: tumbo, utumbo, ini na kongosho.",
      what_to_expect: "Mapitio ya dalili na huenda endoskopi.",
    },
    fr: {
      name: "Gastro-entérologie",
      patient_friendly_name: "Santé digestive",
      description:
        "Soins du système digestif : estomac, intestins, foie et pancréas.",
      what_to_expect: "Revue des symptômes et endoscopie éventuelle.",
    },
    es: {
      name: "Gastroenterología",
      patient_friendly_name: "Salud digestiva",
      description:
        "Atención del sistema digestivo: estómago, intestinos, hígado y páncreas.",
      what_to_expect: "Revisión de síntomas y posible endoscopia.",
    },
    de: {
      name: "Gastroenterologie",
      patient_friendly_name: "Verdauungsgesundheit",
      description:
        "Versorgung des Verdauungssystems: Magen, Darm, Leber und Bauchspeicheldrüse.",
      what_to_expect: "Symptomüberprüfung und mögliche Endoskopie.",
    },
  },
  endocrinology: {
    sw: {
      name: "Endokrinolojia",
      patient_friendly_name: "Homoni na kisukari",
      description:
        "Huduma ya homoni, kisukari, tezi ya dundumio na kimetaboliki.",
      what_to_expect:
        "Vipimo vya damu, viwango vya homoni na mpango wa matibabu.",
    },
    fr: {
      name: "Endocrinologie",
      patient_friendly_name: "Hormones et diabète",
      description:
        "Soins des hormones, du diabète, de la thyroïde et du métabolisme.",
      what_to_expect:
        "Analyses de sang, dosages hormonaux et plan de traitement.",
    },
    es: {
      name: "Endocrinología",
      patient_friendly_name: "Hormonas y diabetes",
      description:
        "Atención de hormonas, diabetes, tiroides y metabolismo.",
      what_to_expect:
        "Análisis de sangre, niveles hormonales y plan de tratamiento.",
    },
    de: {
      name: "Endokrinologie",
      patient_friendly_name: "Hormone und Diabetes",
      description:
        "Versorgung von Hormonen, Diabetes, Schilddrüse und Stoffwechsel.",
      what_to_expect:
        "Blutuntersuchungen, Hormonwerte und Behandlungsplan.",
    },
  },
  pulmonology: {
    sw: {
      name: "Pulmonolojia",
      patient_friendly_name: "Mtaalamu wa mapafu",
      description:
        "Huduma ya mapafu na matatizo ya kupumua kama pumu na COPD.",
      what_to_expect:
        "Vipimo vya kupumua (spirometri) na picha za kifua.",
    },
    fr: {
      name: "Pneumologie",
      patient_friendly_name: "Spécialiste des poumons",
      description:
        "Soins des poumons et des troubles respiratoires tels que l'asthme et la BPCO.",
      what_to_expect:
        "Tests respiratoires (spirométrie) et imagerie thoracique.",
    },
    es: {
      name: "Neumología",
      patient_friendly_name: "Especialista de los pulmones",
      description:
        "Atención de los pulmones y trastornos respiratorios como asma y EPOC.",
      what_to_expect:
        "Pruebas respiratorias (espirometría) e imágenes del tórax.",
    },
    de: {
      name: "Pneumologie",
      patient_friendly_name: "Lungenspezialist",
      description:
        "Versorgung der Lunge und von Atemwegserkrankungen wie Asthma und COPD.",
      what_to_expect:
        "Atemtests (Spirometrie) und Thoraxbildgebung.",
    },
  },
  nephrology: {
    sw: {
      name: "Nefrolojia",
      patient_friendly_name: "Mtaalamu wa figo",
      description:
        "Huduma ya ugonjwa wa figo, dialysis na usawa wa maji mwilini.",
      what_to_expect:
        "Vipimo vya utendaji wa figo na uchunguzi wa mkojo.",
    },
    fr: {
      name: "Néphrologie",
      patient_friendly_name: "Spécialiste des reins",
      description:
        "Soins des maladies rénales, de la dialyse et de l'équilibre hydrique.",
      what_to_expect:
        "Tests de fonction rénale et analyse d'urine.",
    },
    es: {
      name: "Nefrología",
      patient_friendly_name: "Especialista de los riñones",
      description:
        "Atención de enfermedades renales, diálisis y equilibrio de líquidos.",
      what_to_expect: "Pruebas de función renal y análisis de orina.",
    },
    de: {
      name: "Nephrologie",
      patient_friendly_name: "Nierenspezialist",
      description:
        "Versorgung von Nierenerkrankungen, Dialyse und Flüssigkeitshaushalt.",
      what_to_expect: "Nierenfunktionstests und Urinanalyse.",
    },
  },
  hematology: {
    sw: {
      name: "Hematolojia",
      patient_friendly_name: "Mtaalamu wa damu",
      description:
        "Huduma ya matatizo ya damu kama upungufu wa damu, kuvuja damu na saratani za damu.",
      what_to_expect:
        "Idadi ya seli za damu na huenda vipimo vya uboho.",
    },
    fr: {
      name: "Hématologie",
      patient_friendly_name: "Spécialiste du sang",
      description:
        "Soins des troubles du sang tels que l'anémie, les saignements et les cancers du sang.",
      what_to_expect:
        "Numération sanguine et éventuellement tests de moelle osseuse.",
    },
    es: {
      name: "Hematología",
      patient_friendly_name: "Especialista de la sangre",
      description:
        "Atención de trastornos sanguíneos como anemia, hemorragias y cánceres de la sangre.",
      what_to_expect:
        "Recuentos sanguíneos y posiblemente pruebas de médula ósea.",
    },
    de: {
      name: "Hämatologie",
      patient_friendly_name: "Blutspezialist",
      description:
        "Versorgung von Bluterkrankungen wie Anämie, Blutungen und Blutkrebs.",
      what_to_expect:
        "Blutbild und möglicherweise Knochenmarkuntersuchungen.",
    },
  },
  rheumatology: {
    sw: {
      name: "Rumatolojia",
      patient_friendly_name: "Viungo na ugonjwa wa viungo",
      description:
        "Huduma ya ugonjwa wa viungo, magonjwa ya kinga mwili na uvimbe wa misuli au viungo.",
      what_to_expect:
        "Uchunguzi wa viungo na viashiria vya uvimbe kwenye damu.",
    },
    fr: {
      name: "Rhumatologie",
      patient_friendly_name: "Articulations et arthrite",
      description:
        "Soins de l'arthrite, des maladies auto-immunes et des affections inflammatoires des muscles ou des articulations.",
      what_to_expect:
        "Examen des articulations et marqueurs inflammatoires sanguins.",
    },
    es: {
      name: "Reumatología",
      patient_friendly_name: "Articulaciones y artritis",
      description:
        "Atención de artritis, enfermedades autoinmunes y afecciones inflamatorias de músculos o articulaciones.",
      what_to_expect:
        "Examen de articulaciones y marcadores inflamatorios en sangre.",
    },
    de: {
      name: "Rheumatologie",
      patient_friendly_name: "Gelenke und Arthritis",
      description:
        "Versorgung von Arthritis, Autoimmun- und entzündlichen Muskel- oder Gelenkerkrankungen.",
      what_to_expect:
        "Gelenkuntersuchung und Entzündungsmarker im Blut.",
    },
  },
  oncology: {
    sw: {
      name: "Onkolojia",
      patient_friendly_name: "Huduma ya saratani",
      description: "Uchunguzi na mipango ya matibabu ya saratani.",
      what_to_expect:
        "Vipimo vya hatua ya saratani, majadiliano ya upasuaji, kemoterapia au tiba ya mionzi.",
    },
    fr: {
      name: "Oncologie",
      patient_friendly_name: "Soins du cancer",
      description:
        "Diagnostic et planification du traitement du cancer.",
      what_to_expect:
        "Examens de stadification, discussion des options de chirurgie, chimiothérapie ou radiothérapie.",
    },
    es: {
      name: "Oncología",
      patient_friendly_name: "Atención del cáncer",
      description: "Diagnóstico y planificación del tratamiento del cáncer.",
      what_to_expect:
        "Pruebas de estadificación, discusión de opciones de cirugía, quimioterapia o radioterapia.",
    },
    de: {
      name: "Onkologie",
      patient_friendly_name: "Krebsbehandlung",
      description: "Diagnose und Behandlungsplanung bei Krebs.",
      what_to_expect:
        "Staging-Untersuchungen, Besprechung von Operation, Chemo- oder Strahlentherapie.",
    },
  },
  "infectious disease": {
    sw: {
      name: "Magonjwa ya Kuambukiza",
      patient_friendly_name: "Mtaalamu wa maambukizi",
      description:
        "Huduma ya maambukizi magumu au yanayojirudia kama TB, HIV na homa isiyojulikana chanzo.",
      what_to_expect:
        "Mapitio ya matokeo ya mazao ya bakteria na mpango maalum wa dawa za kuua bacteria au virusi.",
    },
    fr: {
      name: "Maladies infectieuses",
      patient_friendly_name: "Spécialiste des infections",
      description:
        "Soins des infections complexes ou récurrentes telles que la tuberculose, le VIH et les fièvres d'origine inconnue.",
      what_to_expect:
        "Revue des résultats de culture et plan ciblé d'antibiotiques ou d'antiviraux.",
    },
    es: {
      name: "Enfermedades infecciosas",
      patient_friendly_name: "Especialista en infecciones",
      description:
        "Atención de infecciones complejas o recurrentes como tuberculosis, VIH y fiebre de origen desconocido.",
      what_to_expect:
        "Revisión de resultados de cultivos y plan dirigido de antibióticos o antivirales.",
    },
    de: {
      name: "Infektiologie",
      patient_friendly_name: "Infektionsspezialist",
      description:
        "Versorgung komplexer oder wiederkehrender Infektionen wie Tuberkulose, HIV und Fieber unbekannter Ursache.",
      what_to_expect:
        "Überprüfung der Kulturergebnisse und gezielter Antibiotika- oder antiviraler Plan.",
    },
  },
  "general surgery": {
    sw: {
      name: "Upasuaji wa Jumla",
      patient_friendly_name: "Mtaalamu wa upasuaji",
      description:
        "Upasuaji wa magonjwa ya tumboni, ngozi na tishu laini.",
      what_to_expect:
        "Tathmini ya kabla ya upasuaji na mipango ya utaratibu wa upasuaji.",
    },
    fr: {
      name: "Chirurgie générale",
      patient_friendly_name: "Spécialiste en chirurgie",
      description:
        "Opérations pour les affections abdominales, cutanées et des tissus mous.",
      what_to_expect:
        "Évaluation préopératoire et planification de l'intervention chirurgicale.",
    },
    es: {
      name: "Cirugía general",
      patient_friendly_name: "Especialista en cirugía",
      description:
        "Operaciones para afecciones abdominales, de la piel y de tejidos blandos.",
      what_to_expect:
        "Evaluación preoperatoria y planificación del procedimiento quirúrgico.",
    },
    de: {
      name: "Allgemeinchirurgie",
      patient_friendly_name: "Chirurgiespezialist",
      description:
        "Operationen bei abdominalen, Haut- und Weichteilerkrankungen.",
      what_to_expect:
        "Präoperative Beurteilung und Planung des chirurgischen Eingriffs.",
    },
  },
  orthopedics: {
    sw: {
      name: "Ortopedi",
      patient_friendly_name: "Mtaalamu wa mifupa na viungo",
      description:
        "Huduma ya mifupa, viungo, misuli na majeraha ya michezo.",
      what_to_expect:
        "Mapitio ya X-ray, tathmini ya harakati na mpango wa matibabu au fizioterapia.",
    },
    fr: {
      name: "Orthopédie",
      patient_friendly_name: "Spécialiste des os et des articulations",
      description:
        "Soins des os, des articulations, des muscles et des blessures sportives.",
      what_to_expect:
        "Revue des radiographies, évaluation du mouvement et plan de traitement ou de physiothérapie.",
    },
    es: {
      name: "Ortopedia",
      patient_friendly_name: "Especialista de huesos y articulaciones",
      description:
        "Atención de huesos, articulaciones, músculos y lesiones deportivas.",
      what_to_expect:
        "Revisión de rayos X, evaluación del movimiento y plan de tratamiento o fisioterapia.",
    },
    de: {
      name: "Orthopädie",
      patient_friendly_name: "Spezialist für Knochen und Gelenke",
      description:
        "Versorgung von Knochen, Gelenken, Muskeln und Sportverletzungen.",
      what_to_expect:
        "Röntgenüberprüfung, Bewegungsbeurteilung und Behandlungs- oder Physiotherapieplan.",
    },
  },
  anesthesiology: {
    sw: {
      name: "Anestesiolojia",
      patient_friendly_name: "Anestesia (usingizi wakati wa upasuaji)",
      description:
        "Udhibiti salama wa maumivu na anestesia wakati wa upasuaji, pamoja na kliniki za maumivu.",
      what_to_expect:
        "Mapitio ya anestesia kabla ya upasuaji na mpango wa kudhibiti maumivu.",
    },
    fr: {
      name: "Anesthésiologie",
      patient_friendly_name: "Anesthésie (sommeil pour la chirurgie)",
      description:
        "Contrôle sûr de la douleur et anesthésie pendant la chirurgie, ainsi que certaines cliniques de la douleur.",
      what_to_expect:
        "Consultation d'anesthésie préopératoire et plan de gestion de la douleur.",
    },
    es: {
      name: "Anestesiología",
      patient_friendly_name: "Anestesia (sueño para cirugía)",
      description:
        "Control seguro del dolor y anestesia durante la cirugía, además de algunas clínicas del dolor.",
      what_to_expect:
        "Revisión anestésica preoperatoria y plan de manejo del dolor.",
    },
    de: {
      name: "Anästhesiologie",
      patient_friendly_name: "Anästhesie (Schlaf für die Operation)",
      description:
        "Sichere Schmerzkontrolle und Anästhesie während der Operation sowie einige Schmerzkliniken.",
      what_to_expect:
        "Präoperative Anästhesiebesprechung und Schmerzmanagementplan.",
    },
  },
  ophthalmology: {
    sw: {
      name: "Oftalmolojia",
      patient_friendly_name: "Mtaalamu wa macho",
      description:
        "Huduma ya uoni, magonjwa ya macho na upasuaji wa macho kama mtoto wa jicho.",
      what_to_expect:
        "Kipimo cha uoni, kipimo cha shinikizo la jicho na uchunguzi wa jicho uliopanuliwa ikihitajika.",
    },
    fr: {
      name: "Ophtalmologie",
      patient_friendly_name: "Spécialiste des yeux",
      description:
        "Soins de la vision, des maladies oculaires et de la chirurgie oculaire telle que la cataracte.",
      what_to_expect:
        "Test de vision, mesure de la pression oculaire et examen dilaté si nécessaire.",
    },
    es: {
      name: "Oftalmología",
      patient_friendly_name: "Especialista de los ojos",
      description:
        "Atención de la visión, enfermedades oculares y cirugía ocular como cataratas.",
      what_to_expect:
        "Prueba de visión, control de presión ocular y examen dilatado si es necesario.",
    },
    de: {
      name: "Augenheilkunde",
      patient_friendly_name: "Augenspezialist",
      description:
        "Versorgung von Sehvermögen, Augenerkrankungen und Augenoperationen wie Katarakt.",
      what_to_expect:
        "Sehtest, Augeninnendruckmessung und erweiterte Untersuchung bei Bedarf.",
    },
  },
  urology: {
    sw: {
      name: "Urolojia",
      patient_friendly_name: "Afya ya mkojo na wanaume",
      description:
        "Huduma ya figo, kibofu, njia ya mkojo na viungo vya uzazi vya mwanaume.",
      what_to_expect:
        "Vipimo vya mkojo na ultrasound au cystoskopi ikihitajika.",
    },
    fr: {
      name: "Urologie",
      patient_friendly_name: "Santé urinaire et masculine",
      description:
        "Soins des reins, de la vessie, des voies urinaires et des organes reproducteurs masculins.",
      what_to_expect:
        "Analyses d'urine et échographie ou cystoscopie si nécessaire.",
    },
    es: {
      name: "Urología",
      patient_friendly_name: "Salud urinaria y masculina",
      description:
        "Atención de riñones, vejiga, vías urinarias y órganos reproductores masculinos.",
      what_to_expect:
        "Análisis de orina y ecografía o cistoscopia si es necesario.",
    },
    de: {
      name: "Urologie",
      patient_friendly_name: "Harn- und Männergesundheit",
      description:
        "Versorgung von Nieren, Blase, Harnwegen und männlichen Fortpflanzungsorganen.",
      what_to_expect:
        "Urintests und Ultraschall oder Zystoskopie bei Bedarf.",
    },
  },
  ent: {
    sw: {
      name: "Masikio, Pua na Koo",
      patient_friendly_name: "Masikio, pua na koo",
      description:
        "Huduma ya masikio, pua, koo na magonjwa yanayohusiana ya kichwa na shingo.",
      what_to_expect:
        "Uchunguzi wa koo, sikio na pua; vipimo vya kusikia au sinus ikihitajika.",
    },
    fr: {
      name: "ORL",
      patient_friendly_name: "Oreilles, nez et gorge",
      description:
        "Soins des oreilles, du nez, de la gorge et des affections associées de la tête et du cou.",
      what_to_expect:
        "Examen de la gorge, des oreilles et du nez ; tests auditifs ou des sinus si nécessaire.",
    },
    es: {
      name: "Otorrinolaringología",
      patient_friendly_name: "Oídos, nariz y garganta",
      description:
        "Atención de oídos, nariz, garganta y afecciones relacionadas de cabeza y cuello.",
      what_to_expect:
        "Examen de garganta, oídos y nariz; pruebas auditivas o de senos paranasales si es necesario.",
    },
    de: {
      name: "Hals-Nasen-Ohren-Heilkunde",
      patient_friendly_name: "Ohren, Nase und Hals",
      description:
        "Versorgung von Ohren, Nase, Hals und damit verbundenen Kopf-Hals-Erkrankungen.",
      what_to_expect:
        "Untersuchung von Hals, Ohren und Nase; Hör- oder Nasennebenhöhlentests bei Bedarf.",
    },
  },
  psychiatry: {
    sw: {
      name: "Saikiatri",
      patient_friendly_name: "Daktari wa afya ya akili",
      description:
        "Huduma ya matibabu ya afya ya akili kama mfadhaiko, wasiwasi na upotovu wa akili.",
      what_to_expect:
        "Ushauri wa siri na mpango wa dawa au tiba.",
    },
    fr: {
      name: "Psychiatrie",
      patient_friendly_name: "Médecin de santé mentale",
      description:
        "Soins médicaux des troubles de santé mentale tels que la dépression, l'anxiété et la psychose.",
      what_to_expect:
        "Consultation confidentielle et plan de médicaments ou de thérapie.",
    },
    es: {
      name: "Psiquiatría",
      patient_friendly_name: "Médico de salud mental",
      description:
        "Atención médica de trastornos de salud mental como depresión, ansiedad y psicosis.",
      what_to_expect:
        "Consulta confidencial y plan de medicación o terapia.",
    },
    de: {
      name: "Psychiatrie",
      patient_friendly_name: "Arzt für psychische Gesundheit",
      description:
        "Medizinische Versorgung psychischer Erkrankungen wie Depression, Angst und Psychose.",
      what_to_expect:
        "Vertrauliche Beratung und Medikamenten- oder Therapieplan.",
    },
  },
  psychology: {
    sw: {
      name: "Saikolojia",
      patient_friendly_name: "Tiba ya mazungumzo",
      description:
        "Tathmini ya kisaikolojia na ushauri kwa matatizo ya kihisia na tabia.",
      what_to_expect:
        "Vikao vya mazungumzo na mpango wa kukabiliana uliobinafsishwa.",
    },
    fr: {
      name: "Psychologie",
      patient_friendly_name: "Thérapie par la parole",
      description:
        "Évaluation psychologique et conseil pour les préoccupations émotionnelles et comportementales.",
      what_to_expect:
        "Séances de parole et plan d'adaptation personnalisé.",
    },
    es: {
      name: "Psicología",
      patient_friendly_name: "Terapia de conversación",
      description:
        "Evaluación psicológica y asesoramiento para problemas emocionales y de conducta.",
      what_to_expect:
        "Sesiones de conversación y plan de afrontamiento personalizado.",
    },
    de: {
      name: "Psychologie",
      patient_friendly_name: "Gesprächstherapie",
      description:
        "Psychologische Beurteilung und Beratung bei emotionalen und Verhaltensproblemen.",
      what_to_expect:
        "Gesprächssitzungen und ein persönlicher Bewältigungsplan.",
    },
  },
  radiology: {
    sw: {
      name: "Radiolojia",
      patient_friendly_name: "Mtaalamu wa picha za matibabu",
      description:
        "Ufafanuzi wa X-ray, ultrasound, CT na MRI kusaidia utambuzi.",
      what_to_expect:
        "Uchunguzi wa picha umepitiwa na kuripotiwa kwa daktari wako.",
    },
    fr: {
      name: "Radiologie",
      patient_friendly_name: "Spécialiste en imagerie",
      description:
        "Interprétation des radiographies, échographies, scanners et IRM pour guider le diagnostic.",
      what_to_expect:
        "Examen d'imagerie analysé et rapporté à votre médecin.",
    },
    es: {
      name: "Radiología",
      patient_friendly_name: "Especialista en imágenes médicas",
      description:
        "Interpretación de rayos X, ecografías, tomografías y resonancias para guiar el diagnóstico.",
      what_to_expect:
        "Estudio de imagen revisado e informado para su médico.",
    },
    de: {
      name: "Radiologie",
      patient_friendly_name: "Spezialist für Bildgebung",
      description:
        "Interpretation von Röntgen, Ultraschall, CT und MRT zur Unterstützung der Diagnose.",
      what_to_expect:
        "Bildgebende Untersuchung wird überprüft und für Ihren Arzt berichtet.",
    },
  },
  "physical medicine & rehabilitation": {
    sw: {
      name: "Tiba ya Viungo na Ukarabati",
      patient_friendly_name: "Daktari wa ukarabati",
      description:
        "Kurejesha uwezo wa kusonga na utendaji wa kila siku baada ya jeraha, kiharusi au upasuaji.",
      what_to_expect:
        "Tathmini ya utendaji na programu ya fizioterapia au ukarabati.",
    },
    fr: {
      name: "Médecine physique et réadaptation",
      patient_friendly_name: "Médecin de réadaptation",
      description:
        "Rétablissement du mouvement et de la fonction quotidienne après une blessure, un AVC ou une chirurgie.",
      what_to_expect:
        "Évaluation fonctionnelle et programme de physiothérapie ou de réadaptation.",
    },
    es: {
      name: "Medicina física y rehabilitación",
      patient_friendly_name: "Médico de rehabilitación",
      description:
        "Recuperación del movimiento y la función diaria tras una lesión, un ictus o una cirugía.",
      what_to_expect:
        "Evaluación funcional y programa de fisioterapia o rehabilitación.",
    },
    de: {
      name: "Physikalische Medizin und Rehabilitation",
      patient_friendly_name: "Rehabilitationsarzt",
      description:
        "Wiederherstellung von Bewegung und Alltagsfunktion nach Verletzung, Schlaganfall oder Operation.",
      what_to_expect:
        "Funktionsbeurteilung und Physiotherapie- oder Rehabilitationsprogramm.",
    },
  },
  dentistry: {
    sw: {
      name: "Dawa za Meno",
      patient_friendly_name: "Huduma ya meno",
      description: "Huduma ya meno, fizi na afya ya kinywa.",
      what_to_expect:
        "Uchunguzi wa meno na usafishaji au mpango wa matibabu.",
    },
    fr: {
      name: "Dentisterie",
      patient_friendly_name: "Soins dentaires",
      description: "Soins des dents, des gencives et de la santé bucco-dentaire.",
      what_to_expect:
        "Examen dentaire et nettoyage ou plan de traitement.",
    },
    es: {
      name: "Odontología",
      patient_friendly_name: "Atención dental",
      description: "Atención de dientes, encías y salud bucal.",
      what_to_expect:
        "Examen dental y limpieza o plan de tratamiento.",
    },
    de: {
      name: "Zahnmedizin",
      patient_friendly_name: "Zahnpflege",
      description: "Versorgung von Zähnen, Zahnfleisch und Mundgesundheit.",
      what_to_expect:
        "Zahnuntersuchung und Reinigung oder Behandlungsplan.",
    },
  },
  "nutrition & dietetics": {
    sw: {
      name: "Lishe na Chakula",
      patient_friendly_name: "Lishe na mlo bora",
      description:
        "Mipango ya lishe na msaada wa lishe kwa afya, uzito na magonjwa sugu.",
      what_to_expect:
        "Mapitio ya mlo na mpango wa lishe uliobinafsishwa.",
    },
    fr: {
      name: "Nutrition et diététique",
      patient_friendly_name: "Alimentation et nutrition",
      description:
        "Plans alimentaires et soutien nutritionnel pour la santé, le poids et les maladies chroniques.",
      what_to_expect: "Bilan alimentaire et plan nutritionnel personnalisé.",
    },
    es: {
      name: "Nutrición y dietética",
      patient_friendly_name: "Dieta y nutrición",
      description:
        "Planes de alimentación y apoyo nutricional para la salud, el peso y las enfermedades crónicas.",
      what_to_expect: "Revisión de la dieta y plan de alimentación personalizado.",
    },
    de: {
      name: "Ernährung und Diätetik",
      patient_friendly_name: "Ernährung und Diät",
      description:
        "Ernährungspläne und Ernährungsunterstützung für Gesundheit, Gewicht und chronische Krankheiten.",
      what_to_expect: "Ernährungsüberprüfung und persönlicher Ernährungsplan.",
    },
  },
  "emergency medicine": {
    sw: {
      name: "Tiba ya Dharura",
      patient_friendly_name: "Daktari wa dharura",
      description:
        "Huduma ya dharura na ya hatari maisha katika idara ya dharura.",
      what_to_expect:
        "Tathmini ya haraka, utulivu na rufaa au kulazwa hospitalini.",
    },
    fr: {
      name: "Médecine d'urgence",
      patient_friendly_name: "Médecin urgentiste",
      description:
        "Soins urgents et vitaux au service des urgences.",
      what_to_expect:
        "Évaluation rapide, stabilisation et orientation ou admission.",
    },
    es: {
      name: "Medicina de urgencias",
      patient_friendly_name: "Médico de urgencias",
      description:
        "Atención urgente y de riesgo vital en el servicio de urgencias.",
      what_to_expect:
        "Evaluación rápida, estabilización y derivación o ingreso.",
    },
    de: {
      name: "Notfallmedizin",
      patient_friendly_name: "Notfallarzt",
      description:
        "Dringende und lebensbedrohliche Versorgung in der Notaufnahme.",
      what_to_expect:
        "Schnelle Beurteilung, Stabilisierung und Überweisung oder Aufnahme.",
    },
  },
};

export type LocalizableSpecialty = {
  name: string;
  patient_friendly_name?: string;
  description?: string;
  what_to_expect?: string;
};

/**
 * Return the specialty with its display fields translated for `language`.
 * English (or an unsupported language) returns the original API object, and
 * a specialty missing from the catalog also falls back to English.
 */
export function localizeSpecialty<T extends LocalizableSpecialty>(
  specialty: T,
  language: string
): T {
  const lang = normalizeLanguage(language);
  if (!lang || lang === "en") return specialty;
  const translation = TRANSLATIONS[specialty.name.trim().toLowerCase()]?.[lang];
  if (!translation) return specialty;
  return {
    ...specialty,
    name: translation.name,
    patient_friendly_name: translation.patient_friendly_name,
    description: translation.description,
    what_to_expect: translation.what_to_expect,
  } as T;
}

/** Friendly label used on cards: translated friendly name, then medical name. */
export function specialtyLabel(
  specialty: LocalizableSpecialty,
  language: string
): string {
  const localized = localizeSpecialty(specialty, language);
  return localized.patient_friendly_name || localized.name;
}
