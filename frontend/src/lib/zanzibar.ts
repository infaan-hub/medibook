/**
 * Zanzibar reference geography — the bundled gazetteer behind every area
 * label, the typed location picker and the 5 km "Near me" filter.
 *
 * Why this exists: Patient/Doctor rows store raw lat/lng, which is exact but
 * meaningless to a human ("-5.73100, 39.30100"). Reverse-geocoding each card
 * against a map SDK would need an API key and a CSP change, so the nearest
 * area is resolved locally with the same Haversine formula that powers the
 * 5 km "Near me" filter. A doctor card can therefore say "1.2 km — Nungwi".
 *
 * Three layers, all reachable through `searchZanzibarAreas`:
 * - settlements — every ward (Kata) of the five Zanzibar regions (331), plus
 *   well-known villages and towns the ward table has no row for (Makunduchi,
 *   Kendwa, Jozani, Pingwe, …) and Stone Town itself;
 * - admin areas — Unguja's six districts and three regions at their real
 *   centroids, so "Kaskazini A" or "Mjini Magharibi" resolve to a coordinate
 *   pair of their own;
 * - streets — the named streets mapped across Unguja, so a typed "Darajani"
 *   lands on Darajani Street.
 *
 * Reverse labels (`nearestAreaName`) only draw from settlements and admin
 * areas: street coverage is too patchy for a stable label, while any land
 * point is always within a few kilometres of a ward. The 15 km cap keeps
 * Dar es Salaam and the open ocean unlabelled.
 *
 * Coordinates are WGS84 decimal degrees — the datum Google Maps uses — so a
 * stored fix, a computed distance and `https://www.google.com/maps?q=lat,lng`
 * all land on exactly the same spot.
 *
 * Sources:
 * - wards, districts and regions: Tanzania Administrative Divisions Dataset
 *   (https://github.com/open-admin-data/tanzania-administrative-divisions)
 *   © Open Admin Data, CC-BY-4.0 — attribution kept here as the licence requires.
 * - streets and village coordinates: © OpenStreetMap contributors (ODbL),
 *   fetched through the Overpass and Nominatim APIs.
 */
import { directionsUrl, haversineKm } from "./location";

/** One row as stored in the bundled dataset. */
type PlaceRow = [name: string, district: string, region: string, latitude: number, longitude: number];

/** An area somebody can actually point at on a map. */
export interface ZanzibarArea {
  /** Place name — what people say out loud ("Nungwi", "Darajani Street"). */
  name: string;
  /** District it sits in, e.g. "Kaskazini A"; district rows carry their own name. */
  district: string;
  /** One of the five Zanzibar regions; region rows carry their own name. */
  region: string;
  island: "Unguja" | "Pemba";
  latitude: number;
  longitude: number;
}

const WARD_ROWS: PlaceRow[] = [
  ["Bopwe", "Wete", "Kaskazini Pemba", -5.051, 39.725],
  ["Chimba", "Micheweni", "Kaskazini Pemba", -4.975, 39.764],
  ["Chwale", "Wete", "Kaskazini Pemba", -5.103, 39.817],
  ["Finya", "Micheweni", "Kaskazini Pemba", -5.03, 39.765],
  ["Fundo", "Wete", "Kaskazini Pemba", -5.068, 39.647],
  ["Gando", "Wete", "Kaskazini Pemba", -4.99, 39.701],
  ["Jadida", "Wete", "Kaskazini Pemba", -5.065, 39.729],
  ["Junguni", "Wete", "Kaskazini Pemba", -5.012, 39.709],
  ["Kambini", "Wete", "Kaskazini Pemba", -5.131, 39.808],
  ["Kangagani", "Wete", "Kaskazini Pemba", -5.142, 39.84],
  ["Kifundi", "Micheweni", "Kaskazini Pemba", -4.968, 39.723],
  ["Kinowe", "Micheweni", "Kaskazini Pemba", -4.944, 39.767],
  ["Kinyasini", "Micheweni", "Kaskazini Pemba", -5.019, 39.743],
  ["Kinyikani", "Wete", "Kaskazini Pemba", -5.124, 39.794],
  ["Kipangani", "Wete", "Kaskazini Pemba", -5.062, 39.723],
  ["Kisiwani", "Wete", "Kaskazini Pemba", -5.155, 39.77],
  ["Kiungoni", "Wete", "Kaskazini Pemba", -5.049, 39.815],
  ["Kiuyu Kigongoni", "Wete", "Kaskazini Pemba", -5.162, 39.812],
  ["Kiuyu Mbuyuni", "Micheweni", "Kaskazini Pemba", -4.931, 39.862],
  ["Kiuyu Minungwini", "Wete", "Kaskazini Pemba", -5.145, 39.816],
  ["Kizimbani", "Wete", "Kaskazini Pemba", -5.05, 39.735],
  ["Kojani", "Wete", "Kaskazini Pemba", -5.075, 39.856],
  ["Konde", "Micheweni", "Kaskazini Pemba", -4.947, 39.734],
  ["Limbani", "Wete", "Kaskazini Pemba", -5.062, 39.749],
  ["Majenzi", "Micheweni", "Kaskazini Pemba", -4.985, 39.83],
  ["Makangale", "Micheweni", "Kaskazini Pemba", -4.897, 39.7],
  ["Maziwa Ng'ombe", "Micheweni", "Kaskazini Pemba", -4.994, 39.861],
  ["Maziwani", "Wete", "Kaskazini Pemba", -5.09, 39.793],
  ["Mchanga Mdogo", "Wete", "Kaskazini Pemba", -5.12, 39.816],
  ["Mgogoni", "Micheweni", "Kaskazini Pemba", -4.999, 39.737],
  ["Micheweni", "Micheweni", "Kaskazini Pemba", -4.975, 39.841],
  ["Mihogoni", "Micheweni", "Kaskazini Pemba", -4.99, 39.786],
  ["Mjini Ole", "Wete", "Kaskazini Pemba", -5.178, 39.827],
  ["Mjini Wingwi", "Micheweni", "Kaskazini Pemba", -5.001, 39.842],
  ["Mlindo", "Micheweni", "Kaskazini Pemba", -5.032, 39.798],
  ["Mpambani", "Wete", "Kaskazini Pemba", -5.101, 39.837],
  ["Msuka Magharibi", "Micheweni", "Kaskazini Pemba", -4.92, 39.727],
  ["Msuka Mashariki", "Micheweni", "Kaskazini Pemba", -4.924, 39.749],
  ["Mtambwe Kaskazini", "Wete", "Kaskazini Pemba", -5.092, 39.712],
  ["Mtambwe Kusini", "Wete", "Kaskazini Pemba", -5.141, 39.696],
  ["Mtemani", "Micheweni", "Kaskazini Pemba", -5.028, 39.829],
  ["Mzambarauni Takao", "Wete", "Kaskazini Pemba", -5.091, 39.772],
  ["Ole", "Wete", "Kaskazini Pemba", -5.186, 39.823],
  ["Pandani", "Wete", "Kaskazini Pemba", -5.057, 39.781],
  ["Pembeni", "Wete", "Kaskazini Pemba", -5.066, 39.813],
  ["Piki", "Wete", "Kaskazini Pemba", -5.107, 39.757],
  ["Selem", "Wete", "Kaskazini Pemba", -5.058, 39.72],
  ["Shengejuu", "Wete", "Kaskazini Pemba", -5.083, 39.816],
  ["Shumba Mjini", "Micheweni", "Kaskazini Pemba", -4.952, 39.827],
  ["Shumba Viamboni", "Micheweni", "Kaskazini Pemba", -4.994, 39.768],
  ["Sizini", "Micheweni", "Kaskazini Pemba", -4.986, 39.809],
  ["Tondooni", "Micheweni", "Kaskazini Pemba", -4.942, 39.693],
  ["Tumbe Magharibi", "Micheweni", "Kaskazini Pemba", -4.945, 39.779],
  ["Tumbe Mashariki", "Micheweni", "Kaskazini Pemba", -4.957, 39.797],
  ["Ukunjwi", "Wete", "Kaskazini Pemba", -5.04, 39.701],
  ["Utaani", "Wete", "Kaskazini Pemba", -5.059, 39.733],
  ["Wingwi Mapofu", "Micheweni", "Kaskazini Pemba", -5.013, 39.804],
  ["Wingwi Mjananza", "Micheweni", "Kaskazini Pemba", -5.042, 39.826],
  ["Wingwi Njuguni", "Micheweni", "Kaskazini Pemba", -5.026, 39.808],
  ["Bandamaji", "Kaskazini A", "Kaskazini Unguja", -5.955, 39.296],
  ["Bwereu", "Kaskazini A", "Kaskazini Unguja", -5.813, 39.305],
  ["Chaani Kubwa", "Kaskazini A", "Kaskazini Unguja", -5.942, 39.31],
  ["Chaani Masingini", "Kaskazini A", "Kaskazini Unguja", -5.925, 39.299],
  ["Chutama", "Kaskazini A", "Kaskazini Unguja", -5.896, 39.294],
  ["Donge  Mchangani", "Kaskazini B", "Kaskazini Unguja", -5.926, 39.228],
  ["Donge Karange", "Kaskazini B", "Kaskazini Unguja", -5.961, 39.275],
  ["Donge Kipange", "Kaskazini B", "Kaskazini Unguja", -5.911, 39.26],
  ["Donge Mbiji", "Kaskazini B", "Kaskazini Unguja", -5.954, 39.246],
  ["Donge Mtambile", "Kaskazini B", "Kaskazini Unguja", -5.927, 39.253],
  ["Donge Vijibweni", "Kaskazini B", "Kaskazini Unguja", -5.941, 39.266],
  ["Fujoni", "Kaskazini B", "Kaskazini Unguja", -6.011, 39.203],
  ["Fukuchani", "Kaskazini A", "Kaskazini Unguja", -5.828, 39.301],
  ["Gamba", "Kaskazini A", "Kaskazini Unguja", -5.906, 39.304],
  ["Jongowe", "Kaskazini A", "Kaskazini Unguja", -5.85, 39.225],
  ["Kandwi", "Kaskazini A", "Kaskazini Unguja", -5.933, 39.335],
  ["Kibeni", "Kaskazini A", "Kaskazini Unguja", -5.872, 39.298],
  ["Kidanzini", "Kaskazini B", "Kaskazini Unguja", -5.981, 39.206],
  ["Kidombo", "Kaskazini A", "Kaskazini Unguja", -5.883, 39.302],
  ["Kidoti", "Kaskazini A", "Kaskazini Unguja", -5.801, 39.325],
  ["Kigomani", "Kaskazini A", "Kaskazini Unguja", -5.849, 39.34],
  ["Kigunda", "Kaskazini A", "Kaskazini Unguja", -5.775, 39.298],
  ["Kijini", "Kaskazini A", "Kaskazini Unguja", -5.842, 39.342],
  ["Kikobweni", "Kaskazini A", "Kaskazini Unguja", -5.951, 39.315],
  ["Kilimani", "Kaskazini A", "Kaskazini Unguja", -5.789, 39.324],
  ["Kilindi", "Kaskazini A", "Kaskazini Unguja", -5.759, 39.316],
  ["Kilombero", "Kaskazini B", "Kaskazini Unguja", -6.022, 39.33],
  ["Kinduni", "Kaskazini B", "Kaskazini Unguja", -5.987, 39.27],
  ["Kinyasini", "Kaskazini A", "Kaskazini Unguja", -5.966, 39.315],
  ["Kiomba Mvua", "Kaskazini B", "Kaskazini Unguja", -6.026, 39.208],
  ["Kisongoni", "Kaskazini A", "Kaskazini Unguja", -5.982, 39.309],
  ["Kitope", "Kaskazini B", "Kaskazini Unguja", -6.02, 39.26],
  ["Kivunge", "Kaskazini A", "Kaskazini Unguja", -5.879, 39.282],
  ["Kiwengwa", "Kaskazini B", "Kaskazini Unguja", -5.988, 39.375],
  ["Mafufuni", "Kaskazini B", "Kaskazini Unguja", -5.923, 39.215],
  ["Mahonda", "Kaskazini B", "Kaskazini Unguja", -5.998, 39.243],
  ["Makoba", "Kaskazini B", "Kaskazini Unguja", -5.953, 39.21],
  ["Mangapwani", "Kaskazini B", "Kaskazini Unguja", -5.993, 39.2],
  ["Matemwe", "Kaskazini A", "Kaskazini Unguja", -5.888, 39.331],
  ["Matetema", "Kaskazini B", "Kaskazini Unguja", -6.018, 39.235],
  ["Mbaleni", "Kaskazini B", "Kaskazini Unguja", -6.02, 39.279],
  ["Mcheza Shauri", "Kaskazini A", "Kaskazini Unguja", -5.933, 39.307],
  ["Mgambo", "Kaskazini B", "Kaskazini Unguja", -5.988, 39.29],
  ["Misufini", "Kaskazini B", "Kaskazini Unguja", -5.964, 39.209],
  ["Mkadini", "Kaskazini B", "Kaskazini Unguja", -6.032, 39.228],
  ["Mkataleni", "Kaskazini B", "Kaskazini Unguja", -5.981, 39.24],
  ["Mkokotoni", "Kaskazini A", "Kaskazini Unguja", -5.881, 39.263],
  ["Mkwajuni", "Kaskazini A", "Kaskazini Unguja", -5.885, 39.286],
  ["Mnyimbi", "Kaskazini B", "Kaskazini Unguja", -5.97, 39.245],
  ["Moga", "Kaskazini A", "Kaskazini Unguja", -5.907, 39.289],
  ["Mto wa Pwani", "Kaskazini A", "Kaskazini Unguja", -5.886, 39.244],
  ["Muwanda", "Kaskazini B", "Kaskazini Unguja", -5.906, 39.226],
  ["Muwange", "Kaskazini A", "Kaskazini Unguja", -5.865, 39.286],
  ["Njia ya Mtoni", "Kaskazini B", "Kaskazini Unguja", -5.928, 39.271],
  ["Nungwi", "Kaskazini A", "Kaskazini Unguja", -5.734, 39.306],
  ["Pale", "Kaskazini A", "Kaskazini Unguja", -5.896, 39.254],
  ["Pangeni", "Kaskazini B", "Kaskazini Unguja", -6.002, 39.318],
  ["Pitanazako", "Kaskazini A", "Kaskazini Unguja", -5.871, 39.278],
  ["Potowa", "Kaskazini A", "Kaskazini Unguja", -5.85, 39.287],
  ["Pwani Mchangani", "Kaskazini A", "Kaskazini Unguja", -5.928, 39.355],
  ["Tazari", "Kaskazini A", "Kaskazini Unguja", -5.78, 39.322],
  ["Tumbatu Gomani", "Kaskazini A", "Kaskazini Unguja", -5.789, 39.229],
  ["Upenja", "Kaskazini B", "Kaskazini Unguja", -5.981, 39.335],
  ["Uvivini", "Kaskazini A", "Kaskazini Unguja", -5.83, 39.224],
  ["Zingwe Zingwe", "Kaskazini B", "Kaskazini Unguja", -6.007, 39.224],
  ["Chachani", "Chake Chake", "Kusini Pemba", -5.243, 39.769],
  ["Chambani", "Mkoani", "Kusini Pemba", -5.346, 39.781],
  ["Changaweni", "Mkoani", "Kusini Pemba", -5.368, 39.671],
  ["Chanjaani", "Chake Chake", "Kusini Pemba", -5.265, 39.768],
  ["Chokocho", "Mkoani", "Kusini Pemba", -5.423, 39.652],
  ["Chonga", "Chake Chake", "Kusini Pemba", -5.304, 39.739],
  ["Chumbageni", "Mkoani", "Kusini Pemba", -5.324, 39.695],
  ["Dodo", "Chake Chake", "Kusini Pemba", -5.304, 39.795],
  ["Jombwe", "Mkoani", "Kusini Pemba", -5.419, 39.758],
  ["Kangani", "Mkoani", "Kusini Pemba", -5.424, 39.693],
  ["Kendwa", "Mkoani", "Kusini Pemba", -5.385, 39.741],
  ["Kengeja", "Mkoani", "Kusini Pemba", -5.424, 39.723],
  ["Kibokoni", "Chake Chake", "Kusini Pemba", -5.248, 39.83],
  ["Kichungwani", "Chake Chake", "Kusini Pemba", -5.25, 39.76],
  ["Kilindi", "Chake Chake", "Kusini Pemba", -5.265, 39.718],
  ["Kisiwa Panza", "Mkoani", "Kusini Pemba", -5.443, 39.616],
  ["Kiwani", "Mkoani", "Kusini Pemba", -5.4, 39.773],
  ["Kuukuu", "Mkoani", "Kusini Pemba", -5.442, 39.701],
  ["Kwale", "Chake Chake", "Kusini Pemba", -5.201, 39.763],
  ["Madungu", "Chake Chake", "Kusini Pemba", -5.25, 39.77],
  ["Makombeni", "Mkoani", "Kusini Pemba", -5.334, 39.654],
  ["Makoongwe", "Mkoani", "Kusini Pemba", -5.379, 39.618],
  ["Matale", "Chake Chake", "Kusini Pemba", -5.299, 39.772],
  ["Mbuguani", "Mkoani", "Kusini Pemba", -5.35, 39.67],
  ["Mbuyuni", "Mkoani", "Kusini Pemba", -5.367, 39.645],
  ["Mbuzini", "Chake Chake", "Kusini Pemba", -5.191, 39.782],
  ["Mfikiwa", "Chake Chake", "Kusini Pemba", -5.274, 39.795],
  ["Mgagadu", "Mkoani", "Kusini Pemba", -5.34, 39.727],
  ["Mgelema", "Chake Chake", "Kusini Pemba", -5.302, 39.711],
  ["Mgogoni", "Chake Chake", "Kusini Pemba", -5.256, 39.788],
  ["Michenzani", "Mkoani", "Kusini Pemba", -5.4, 39.641],
  ["Michungwani", "Chake Chake", "Kusini Pemba", -5.21, 39.754],
  ["Minazini", "Mkoani", "Kusini Pemba", -5.373, 39.727],
  ["Mizingani", "Mkoani", "Kusini Pemba", -5.355, 39.699],
  ["Mjimbini", "Mkoani", "Kusini Pemba", -5.404, 39.693],
  ["Mkanyageni", "Mkoani", "Kusini Pemba", -5.409, 39.665],
  ["Mkoroshoni", "Chake Chake", "Kusini Pemba", -5.231, 39.777],
  ["Mkungu", "Mkoani", "Kusini Pemba", -5.401, 39.721],
  ["Msingini", "Chake Chake", "Kusini Pemba", -5.243, 39.772],
  ["Mtambile", "Mkoani", "Kusini Pemba", -5.376, 39.699],
  ["Mtangani", "Mkoani", "Kusini Pemba", -5.377, 39.77],
  ["Muambe", "Mkoani", "Kusini Pemba", -5.427, 39.75],
  ["Mvumoni", "Chake Chake", "Kusini Pemba", -5.26, 39.815],
  ["Ndagoni", "Chake Chake", "Kusini Pemba", -5.208, 39.686],
  ["Ng'ambwa", "Chake Chake", "Kusini Pemba", -5.214, 39.791],
  ["Ng'ombeni", "Mkoani", "Kusini Pemba", -5.352, 39.647],
  ["Ngwachani", "Mkoani", "Kusini Pemba", -5.329, 39.741],
  ["Pujini", "Chake Chake", "Kusini Pemba", -5.295, 39.813],
  ["Shamiani", "Mkoani", "Kusini Pemba", -5.453, 39.733],
  ["Shidi", "Mkoani", "Kusini Pemba", -5.383, 39.654],
  ["Shungi", "Chake Chake", "Kusini Pemba", -5.274, 39.749],
  ["Stahabu", "Mkoani", "Kusini Pemba", -5.411, 39.643],
  ["Tibirinzi", "Chake Chake", "Kusini Pemba", -5.231, 39.759],
  ["Ukutini", "Mkoani", "Kusini Pemba", -5.348, 39.755],
  ["Uwandani", "Chake Chake", "Kusini Pemba", -5.2, 39.833],
  ["Uweleni", "Mkoani", "Kusini Pemba", -5.362, 39.653],
  ["Vitongoji", "Chake Chake", "Kusini Pemba", -5.221, 39.832],
  ["Wambaa", "Mkoani", "Kusini Pemba", -5.298, 39.679],
  ["Wara", "Chake Chake", "Kusini Pemba", -5.235, 39.783],
  ["Wawi", "Chake Chake", "Kusini Pemba", -5.24, 39.797],
  ["Wesha", "Chake Chake", "Kusini Pemba", -5.219, 39.736],
  ["Ziwani", "Chake Chake", "Kusini Pemba", -5.178, 39.762],
  ["Bambi", "Kati", "Kusini Unguja", -6.072, 39.365],
  ["Binguni", "Kati", "Kusini Unguja", -6.172, 39.327],
  ["Bungi", "Kati", "Kusini Unguja", -6.25, 39.34],
  ["Bwejuu", "Kusini", "Kusini Unguja", -6.247, 39.501],
  ["Charawe", "Kati", "Kusini Unguja", -6.215, 39.429],
  ["Cheju", "Kati", "Kusini Unguja", -6.215, 39.377],
  ["Chwaka", "Kati", "Kusini Unguja", -6.169, 39.419],
  ["Dongwe", "Kusini", "Kusini Unguja", -6.207, 39.504],
  ["Dunga Bweni", "Kati", "Kusini Unguja", -6.116, 39.329],
  ["Dunga Kiembeni", "Kati", "Kusini Unguja", -6.146, 39.329],
  ["Ghana", "Kati", "Kusini Unguja", -6.041, 39.297],
  ["Jambiani Kibigija", "Kusini", "Kusini Unguja", -6.31, 39.508],
  ["Jambiani Kikadini", "Kusini", "Kusini Unguja", -6.347, 39.524],
  ["Jendele", "Kati", "Kusini Unguja", -6.171, 39.38],
  ["Jumbi", "Kati", "Kusini Unguja", -6.197, 39.295],
  ["Kajengwa", "Kusini", "Kusini Unguja", -6.385, 39.537],
  ["Kiboje Mkwajuni", "Kati", "Kusini Unguja", -6.086, 39.309],
  ["Kiboje Muembeshauri", "Kati", "Kusini Unguja", -6.064, 39.302],
  ["Kibuteni", "Kusini", "Kusini Unguja", -6.415, 39.488],
  ["Kidimni", "Kati", "Kusini Unguja", -6.118, 39.301],
  ["Kijini", "Kusini", "Kusini Unguja", -6.424, 39.525],
  ["Kikungwi", "Kati", "Kusini Unguja", -6.285, 39.352],
  ["Kiongoni", "Kusini", "Kusini Unguja", -6.414, 39.563],
  ["Kitogani", "Kusini", "Kusini Unguja", -6.28, 39.446],
  ["Kizimkazi Dimbani", "Kusini", "Kusini Unguja", -6.415, 39.458],
  ["Kizimkazi Mkunguni", "Kusini", "Kusini Unguja", -6.457, 39.481],
  ["Koani", "Kati", "Kusini Unguja", -6.129, 39.281],
  ["Machui", "Kati", "Kusini Unguja", -6.102, 39.284],
  ["Marumbi", "Kati", "Kusini Unguja", -6.133, 39.416],
  ["Mchangani", "Kati", "Kusini Unguja", -6.039, 39.342],
  ["Mgeni Haji", "Kati", "Kusini Unguja", -6.092, 39.327],
  ["Michamvi", "Kati", "Kusini Unguja", -6.15, 39.509],
  ["Mitakawani", "Kati", "Kusini Unguja", -6.067, 39.335],
  ["Miwani", "Kati", "Kusini Unguja", -6.08, 39.291],
  ["Mpapa", "Kati", "Kusini Unguja", -6.1, 39.339],
  ["Mtende", "Kusini", "Kusini Unguja", -6.458, 39.527],
  ["Muungoni", "Kusini", "Kusini Unguja", -6.314, 39.444],
  ["Muyuni A", "Kusini", "Kusini Unguja", -6.342, 39.454],
  ["Muyuni B", "Kusini", "Kusini Unguja", -6.363, 39.463],
  ["Muyuni C", "Kusini", "Kusini Unguja", -6.381, 39.472],
  ["Mzuri", "Kusini", "Kusini Unguja", -6.431, 39.55],
  ["Ndijani Mseweni", "Kati", "Kusini Unguja", -6.195, 39.345],
  ["Ndijani Muembe Punda", "Kati", "Kusini Unguja", -6.167, 39.349],
  ["Ng'ambwa", "Kati", "Kusini Unguja", -6.365, 39.4],
  ["Nganani", "Kusini", "Kusini Unguja", -6.41, 39.542],
  ["Pagali", "Kati", "Kusini Unguja", -6.099, 39.369],
  ["Paje", "Kusini", "Kusini Unguja", -6.274, 39.502],
  ["Pete", "Kusini", "Kusini Unguja", -6.284, 39.409],
  ["Pongwe", "Kati", "Kusini Unguja", -6.046, 39.408],
  ["Tasani", "Kusini", "Kusini Unguja", -6.427, 39.563],
  ["Tindini", "Kati", "Kusini Unguja", -6.301, 39.371],
  ["Tunduni", "Kati", "Kusini Unguja", -6.056, 39.336],
  ["Tunguu", "Kati", "Kusini Unguja", -6.21, 39.329],
  ["Ubago", "Kati", "Kusini Unguja", -6.154, 39.29],
  ["Ukongoroni", "Kati", "Kusini Unguja", -6.216, 39.464],
  ["Umbuji", "Kati", "Kusini Unguja", -6.13, 39.372],
  ["Unguja Ukuu Kaebona", "Kati", "Kusini Unguja", -6.274, 39.373],
  ["Unguja Ukuu Kaepwani", "Kati", "Kusini Unguja", -6.314, 39.376],
  ["Uroa", "Kati", "Kusini Unguja", -6.094, 39.412],
  ["Uzi", "Kati", "Kusini Unguja", -6.325, 39.394],
  ["Uzini", "Kati", "Kusini Unguja", -6.077, 39.333],
  ["Amani", "Mjini", "Mjini Magharibi", -6.163, 39.221],
  ["Bububu", "Magharibi", "Mjini Magharibi", -6.1, 39.226],
  ["Bumbwisudi", "Magharibi", "Mjini Magharibi", -6.058, 39.272],
  ["Bweleo", "Magharibi", "Mjini Magharibi", -6.295, 39.276],
  ["Chuini", "Magharibi", "Mjini Magharibi", -6.066, 39.222],
  ["Chukwani", "Magharibi", "Mjini Magharibi", -6.237, 39.216],
  ["Chumbuni", "Mjini", "Mjini Magharibi", -6.152, 39.218],
  ["Dimani", "Magharibi", "Mjini Magharibi", -6.273, 39.267],
  ["Dole", "Magharibi", "Mjini Magharibi", -6.102, 39.257],
  ["Fumba", "Magharibi", "Mjini Magharibi", -6.314, 39.283],
  ["Fuoni Kibondeni", "Magharibi", "Mjini Magharibi", -6.206, 39.283],
  ["Fuoni Kijito Upele", "Magharibi", "Mjini Magharibi", -6.202, 39.249],
  ["Gulioni", "Mjini", "Mjini Magharibi", -6.158, 39.203],
  ["Jang'ombe", "Mjini", "Mjini Magharibi", -6.174, 39.211],
  ["Kama", "Magharibi", "Mjini Magharibi", -6.047, 39.214],
  ["Karakana", "Mjini", "Mjini Magharibi", -6.145, 39.217],
  ["Kianga", "Magharibi", "Mjini Magharibi", -6.13, 39.255],
  ["Kibweni", "Magharibi", "Mjini Magharibi", -6.114, 39.221],
  ["Kidongo Chekundu", "Mjini", "Mjini Magharibi", -6.169, 39.211],
  ["Kiembesamaki", "Magharibi", "Mjini Magharibi", -6.215, 39.215],
  ["Kihinani", "Magharibi", "Mjini Magharibi", -6.084, 39.223],
  ["Kikwajuni Bondeni", "Mjini", "Mjini Magharibi", -6.168, 39.195],
  ["Kikwajuni Juu", "Mjini", "Mjini Magharibi", -6.17, 39.195],
  ["Kilimahewa Bondeni", "Mjini", "Mjini Magharibi", -6.16, 39.218],
  ["Kilimahewa Juu", "Mjini", "Mjini Magharibi", -6.161, 39.223],
  ["Kilimani", "Mjini", "Mjini Magharibi", -6.183, 39.202],
  ["Kinuni", "Magharibi", "Mjini Magharibi", -6.173, 39.242],
  ["Kiponda", "Mjini", "Mjini Magharibi", -6.16, 39.191],
  ["Kisauni", "Magharibi", "Mjini Magharibi", -6.214, 39.233],
  ["Kisima Majongoo", "Mjini", "Mjini Magharibi", -6.167, 39.198],
  ["Kisiwandui", "Mjini", "Mjini Magharibi", -6.166, 39.196],
  ["Kizimbani", "Magharibi", "Mjini Magharibi", -6.084, 39.265],
  ["Kombeni", "Magharibi", "Mjini Magharibi", -6.252, 39.277],
  ["Kwa Wazee", "Mjini", "Mjini Magharibi", -6.167, 39.222],
  ["Kwaalimsha", "Mjini", "Mjini Magharibi", -6.164, 39.21],
  ["Kwaalinatu", "Mjini", "Mjini Magharibi", -6.17, 39.205],
  ["Kwahani", "Mjini", "Mjini Magharibi", -6.167, 39.208],
  ["Kwamtipura", "Mjini", "Mjini Magharibi", -6.157, 39.22],
  ["Magogoni", "Magharibi", "Mjini Magharibi", -6.161, 39.234],
  ["Magomeni", "Mjini", "Mjini Magharibi", -6.177, 39.219],
  ["Makadara", "Mjini", "Mjini Magharibi", -6.158, 39.207],
  ["Malindi", "Mjini", "Mjini Magharibi", -6.158, 39.197],
  ["Matarumbeta", "Mjini", "Mjini Magharibi", -6.172, 39.208],
  ["Maungani", "Magharibi", "Mjini Magharibi", -6.232, 39.252],
  ["Mbuzini", "Magharibi", "Mjini Magharibi", -6.074, 39.24],
  ["Mchangani", "Mjini", "Mjini Magharibi", -6.16, 39.197],
  ["Melinne", "Magharibi", "Mjini Magharibi", -6.184, 39.23],
  ["Meya", "Mjini", "Mjini Magharibi", -6.175, 39.215],
  ["Mfenesini", "Magharibi", "Mjini Magharibi", -6.048, 39.232],
  ["Miembeni", "Mjini", "Mjini Magharibi", -6.173, 39.202],
  ["Migombani", "Mjini", "Mjini Magharibi", -6.188, 39.212],
  ["Mikunguni", "Mjini", "Mjini Magharibi", -6.163, 39.207],
  ["Mkele", "Mjini", "Mjini Magharibi", -6.161, 39.212],
  ["Mkunazini", "Mjini", "Mjini Magharibi", -6.165, 39.192],
  ["Mlandege", "Mjini", "Mjini Magharibi", -6.162, 39.2],
  ["Mombasa", "Magharibi", "Mjini Magharibi", -6.2, 39.221],
  ["Mpendae", "Mjini", "Mjini Magharibi", -6.184, 39.215],
  ["Mtoni", "Magharibi", "Mjini Magharibi", -6.127, 39.225],
  ["Mtoni Kidatu", "Magharibi", "Mjini Magharibi", -6.138, 39.225],
  ["Mtopepo", "Magharibi", "Mjini Magharibi", -6.147, 39.228],
  ["Mtufaani", "Magharibi", "Mjini Magharibi", -6.159, 39.246],
  ["Muembeshauri", "Mjini", "Mjini Magharibi", -6.167, 39.201],
  ["Muembetanga", "Mjini", "Mjini Magharibi", -6.164, 39.197],
  ["Muungano", "Mjini", "Mjini Magharibi", -6.166, 39.213],
  ["Mwakaje", "Magharibi", "Mjini Magharibi", -6.047, 39.262],
  ["Mwanakwerekwe", "Magharibi", "Mjini Magharibi", -6.178, 39.231],
  ["Mwanyanya", "Magharibi", "Mjini Magharibi", -6.111, 39.225],
  ["Mwembe Makumbi", "Mjini", "Mjini Magharibi", -6.147, 39.208],
  ["Mwembeladu", "Mjini", "Mjini Magharibi", -6.163, 39.203],
  ["Mwera", "Magharibi", "Mjini Magharibi", -6.158, 39.265],
  ["Nyamanzi", "Magharibi", "Mjini Magharibi", -6.265, 39.247],
  ["Nyerere", "Mjini", "Mjini Magharibi", -6.173, 39.221],
  ["Pangawe", "Magharibi", "Mjini Magharibi", -6.182, 39.249],
  ["Rahaleo", "Mjini", "Mjini Magharibi", -6.164, 39.202],
  ["Sebleni", "Mjini", "Mjini Magharibi", -6.166, 39.216],
  ["Shakani", "Magharibi", "Mjini Magharibi", -6.245, 39.241],
  ["Shangani", "Mjini", "Mjini Magharibi", -6.166, 39.189],
  ["Sharifumsa", "Magharibi", "Mjini Magharibi", -6.121, 39.22],
  ["Shaurimoyo", "Mjini", "Mjini Magharibi", -6.156, 39.208],
  ["Sogea", "Mjini", "Mjini Magharibi", -6.17, 39.215],
  ["Tomondo", "Magharibi", "Mjini Magharibi", -6.191, 39.229],
  ["Urusi", "Mjini", "Mjini Magharibi", -6.179, 39.208],
  ["Vikokotoni", "Mjini", "Mjini Magharibi", -6.163, 39.196],
  ["Welezo", "Magharibi", "Mjini Magharibi", -6.158, 39.228],
];

/**
 * Villages and towns that are not wards of their own — real settlements
 * people name out loud, geocoded from OpenStreetMap. Stone Town closes the
 * list: it is the old city, not a ward, and used to be fudged through the
 * alias table.
 */
const PLACE_ROWS: PlaceRow[] = [
  ["Jozani", "Kusini", "Kusini Unguja", -6.26715, 39.42843],
  ["Kendwa", "Kaskazini A", "Kaskazini Unguja", -5.75158, 39.29122],
  ["Makunduchi", "Kusini", "Kusini Unguja", -6.41275, 39.55337],
  ["Mbweni", "Magharibi", "Mjini Magharibi", -6.21835, 39.20393],
  ["Michenzani", "Mjini", "Mjini Magharibi", -6.1652, 39.19889],
  ["Mtegani", "Kusini", "Kusini Unguja", -6.407, 39.55511],
  ["Pingwe", "Kati", "Kusini Unguja", -6.14998, 39.51659],
  ["Stone Town", "Mjini", "Mjini Magharibi", -6.16266, 39.19001],
];

/** Unguja's districts and regions at their administrative centroids (OAD). */
const ADMIN_ROWS: PlaceRow[] = [
  ["Kaskazini A", "Kaskazini A", "Kaskazini Unguja", -5.856, 39.299],
  ["Kaskazini B", "Kaskazini B", "Kaskazini Unguja", -5.966, 39.291],
  ["Kati", "Kati", "Kusini Unguja", -6.207, 39.399],
  ["Kusini", "Kusini", "Kusini Unguja", -6.327, 39.484],
  ["Magharibi", "Magharibi", "Mjini Magharibi", -6.174, 39.255],
  ["Mjini", "Mjini", "Mjini Magharibi", -6.167, 39.206],
  ["Kaskazini Unguja", "Kaskazini Unguja", "Kaskazini Unguja", -5.881, 39.291],
  ["Kusini Unguja", "Kusini Unguja", "Kusini Unguja", -6.25, 39.425],
  ["Mjini Magharibi", "Mjini Magharibi", "Mjini Magharibi", -6.174, 39.248],
];

/**
 * Named streets of Unguja (© OpenStreetMap contributors, ODbL), each row
 * parked in the district of its nearest ward. Searchable so a typed address
 * lands on real coordinates, but never used as a reverse-geocode label.
 */
const STREET_ROWS: PlaceRow[] = [
  ["Afya Street", "Magharibi", "Mjini Magharibi", -6.21407, 39.20817],
  ["Ali Mtumwa Road", "Kusini", "Kusini Unguja", -6.30605, 39.54109],
  ["Baghani Street", "Mjini", "Mjini Magharibi", -6.16363, 39.1883],
  ["Barabara Doctor Shein", "Kati", "Kusini Unguja", -6.27776, 39.36515],
  ["Barabara Kibaoni", "Kati", "Kusini Unguja", -6.14105, 39.32706],
  ["Barabara Taec", "Kati", "Kusini Unguja", -6.14367, 39.33834],
  ["Barabara U/Ukuu - Uzi", "Kati", "Kusini Unguja", -6.27836, 39.3654],
  ["Barabara ya Fuoni Jitimai", "Magharibi", "Mjini Magharibi", -6.19941, 39.25352],
  ["Barabara ya Kinuni", "Magharibi", "Mjini Magharibi", -6.17354, 39.24486],
  ["Barabara ya Kwarara", "Magharibi", "Mjini Magharibi", -6.1939, 39.24416],
  ["Barabara ya MamboSasa", "Magharibi", "Mjini Magharibi", -6.17857, 39.25578],
  ["Barabara ya Nyarugusu", "Magharibi", "Mjini Magharibi", -6.17449, 39.24016],
  ["Benjamin Mkapa Road", "Mjini", "Mjini Magharibi", -6.167, 39.19203],
  ["Benjamin William Road", "Mjini", "Mjini Magharibi", -6.1495, 39.22141],
  ["Bima Road", "Magharibi", "Mjini Magharibi", -6.21058, 39.20668],
  ["Bondeni viamboni", "Kaskazini A", "Kaskazini Unguja", -5.72896, 39.30256],
  ["Cathedral Street", "Mjini", "Mjini Magharibi", -6.16227, 39.18898],
  ["Changa Bazaar", "Mjini", "Mjini Magharibi", -6.16123, 39.19142],
  ["Chumbuni Road", "Mjini", "Mjini Magharibi", -6.15778, 39.22195],
  ["Chwaka Road", "Kati", "Kusini Unguja", -6.15902, 39.37815],
  ["Cocobelo Way", "Kaskazini A", "Kaskazini Unguja", -5.735, 39.29201],
  ["Creek Road", "Mjini", "Mjini Magharibi", -6.16126, 39.19433],
  ["Darajani Street", "Mjini", "Mjini Magharibi", -6.16104, 39.19571],
  ["Daznundaz maskan", "Kusini", "Kusini Unguja", -6.41696, 39.54854],
  ["Felix Moumi Road", "Mjini", "Mjini Magharibi", -6.1722, 39.20195],
  ["Forest Conservancy Road", "Kati", "Kusini Unguja", -6.17408, 39.41008],
  ["Forodhani Street", "Mjini", "Mjini Magharibi", -6.16069, 39.19025],
  ["Fumba Road", "Magharibi", "Mjini Magharibi", -6.19722, 39.21297],
  ["Gizenga Street", "Mjini", "Mjini Magharibi", -6.16203, 39.18864],
  ["Glorious School Street", "Mjini", "Mjini Magharibi", -6.18481, 39.21507],
  ["Hamamni Street", "Mjini", "Mjini Magharibi", -6.1623, 39.19004],
  ["Hospital Road", "Kusini", "Kusini Unguja", -6.4171, 39.55521],
  ["Huda Street", "Magharibi", "Mjini Magharibi", -6.22039, 39.21458],
  ["Hurumzi Street", "Mjini", "Mjini Magharibi", -6.16092, 39.19088],
  ["Ipa Road", "Kati", "Kusini Unguja", -6.19976, 39.30491],
  ["Jamatini Road", "Mjini", "Mjini Magharibi", -6.16063, 39.19189],
  ["Jambiani Road", "Kusini", "Kusini Unguja", -6.3433, 39.55137],
  ["Jambo Beach", "Kusini", "Kusini Unguja", -6.26359, 39.53565],
  ["Jaws Corner", "Mjini", "Mjini Magharibi", -6.1633, 39.18981],
  ["Kajengwa Road", "Kusini", "Kusini Unguja", -6.40916, 39.55228],
  ["Kajifichenii Street", "Mjini", "Mjini Magharibi", -6.1626, 39.19046],
  ["Karume Road", "Mjini", "Mjini Magharibi", -6.17305, 39.21743],
  ["Kaunda Road", "Mjini", "Mjini Magharibi", -6.16757, 39.19014],
  ["Kendwa Road", "Kaskazini A", "Kaskazini Unguja", -5.75571, 39.29604],
  ["Kenyatta Road", "Mjini", "Mjini Magharibi", -6.16334, 39.18763],
  ["Kibondeni Road", "Kusini", "Kusini Unguja", -6.42892, 39.54901],
  ["Kibunju Street", "Magharibi", "Mjini Magharibi", -6.24449, 39.25139],
  ["Kihindi - Chwaka Conservancy Road", "Kati", "Kusini Unguja", -6.17209, 39.41561],
  ["Kijini to mialeni Way", "Kusini", "Kusini Unguja", -6.41716, 39.54739],
  ["Kikwajuni Juu Street", "Mjini", "Mjini Magharibi", -6.16672, 39.19798],
  ["Kikwajuni kwa Bi Thania Street", "Mjini", "Mjini Magharibi", -6.1674, 39.19532],
  ["Kisakasaka Road", "Magharibi", "Mjini Magharibi", -6.24654, 39.27525],
  ["Kisernakani Road", "Kaskazini A", "Kaskazini Unguja", -5.77096, 39.30221],
  ["Kisima Majongoo Street", "Mjini", "Mjini Magharibi", -6.16528, 39.19695],
  ["Kisiwani Street", "Magharibi", "Mjini Magharibi", -6.22292, 39.21174],
  ["Kwa Mjeshi Street", "Magharibi", "Mjini Magharibi", -6.22338, 39.24906],
  ["Kwamchina Road", "Mjini", "Mjini Magharibi", -6.18969, 39.218],
  ["La gemma Road", "Kaskazini A", "Kaskazini Unguja", -5.74315, 39.2967],
  ["Labama Street", "Mjini", "Mjini Magharibi", -6.16789, 39.20128],
  ["Lebanon Street", "Mjini", "Mjini Magharibi", -6.1632, 39.18901],
  ["Mahodhini Street", "Magharibi", "Mjini Magharibi", -6.22332, 39.20864],
  ["Makunduchi Road", "Kusini", "Kusini Unguja", -6.4151, 39.52953],
  ["Malawi Road", "Magharibi", "Mjini Magharibi", -6.12758, 39.21364],
  ["Malindi Road", "Mjini", "Mjini Magharibi", -6.15756, 39.19337],
  ["Malindi Street", "Mjini", "Mjini Magharibi", -6.15939, 39.19327],
  ["Mapinduzi Road", "Mjini", "Mjini Magharibi", -6.16914, 39.19349],
  ["Market Street", "Mjini", "Mjini Magharibi", -6.16257, 39.19294],
  ["Mataka Street", "Magharibi", "Mjini Magharibi", -6.21853, 39.21814],
  ["Mbweni Road", "Magharibi", "Mjini Magharibi", -6.21422, 39.2122],
  ["Meli saba to kijichi Road", "Magharibi", "Mjini Magharibi", -6.09348, 39.22159],
  ["Michamvi Road", "Kati", "Kusini Unguja", -6.14462, 39.49764],
  ["Mizingani Road", "Mjini", "Mjini Magharibi", -6.16012, 39.18992],
  ["Mkangeni", "Magharibi", "Mjini Magharibi", -6.08595, 39.24217],
  ["Mkunazini Street", "Mjini", "Mjini Magharibi", -6.16434, 39.19154],
  ["Mkunguni", "Kaskazini A", "Kaskazini Unguja", -5.72661, 39.30397],
  ["Mkungwini", "Kusini", "Kusini Unguja", -6.40382, 39.55016],
  ["Mlandege Road", "Mjini", "Mjini Magharibi", -6.16968, 39.19886],
  ["Mrembo Street", "Mjini", "Mjini Magharibi", -6.16298, 39.18951],
  ["Mskiti Mabatini Street", "Mjini", "Mjini Magharibi", -6.16528, 39.1955],
  ["Mtaa Kidundo", "Magharibi", "Mjini Magharibi", -6.18228, 39.22451],
  ["Mtende Road", "Kusini", "Kusini Unguja", -6.4445, 39.52178],
  ["Mtoro Road", "Mjini", "Mjini Magharibi", -6.16656, 39.19093],
  ["Museum Road", "Mjini", "Mjini Magharibi", -6.16728, 39.19038],
  ["Mwakani Road", "Kusini", "Kusini Unguja", -6.42074, 39.5509],
  ["Mwana Street", "Magharibi", "Mjini Magharibi", -6.21921, 39.21604],
  ["Mwanakwerekwe Flyover", "Mjini", "Mjini Magharibi", -6.17767, 39.22227],
  ["New Mkunazini Road", "Mjini", "Mjini Magharibi", -6.16375, 39.1919],
  ["Ngongoni Street", "Mjini", "Mjini Magharibi", -6.16921, 39.19579],
  ["Njia ya Chunga", "Magharibi", "Mjini Magharibi", -6.17882, 39.26126],
  ["Njia ya Garagara", "Magharibi", "Mjini Magharibi", -6.13841, 39.22677],
  ["Njia ya Kwarara madina", "Magharibi", "Mjini Magharibi", -6.21164, 39.2493],
  ["Njia ya Maharibiko", "Magharibi", "Mjini Magharibi", -6.18745, 39.25363],
  ["Njia ya Matemwe", "Kaskazini A", "Kaskazini Unguja", -5.88503, 39.288],
  ["Njia ya Mina", "Mjini", "Mjini Magharibi", -6.14499, 39.2219],
  ["Njia ya Mtundani", "Magharibi", "Mjini Magharibi", -6.18931, 39.25699],
  ["Nyerere Road", "Mjini", "Mjini Magharibi", -6.1723, 39.1968],
  ["Nyumba ya Moto Street", "Mjini", "Mjini Magharibi", -6.16025, 39.19057],
  ["Pigawadi Street", "Mjini", "Mjini Magharibi", -6.16419, 39.18989],
  ["Shangani Street", "Mjini", "Mjini Magharibi", -6.16343, 39.18691],
  ["Soko Muhogo Street", "Mjini", "Mjini Magharibi", -6.16434, 39.19042],
  ["Suicide Alley", "Mjini", "Mjini Magharibi", -6.16412, 39.18695],
  ["Tharia Street", "Mjini", "Mjini Magharibi", -6.16214, 39.19219],
  ["Ufufuma Streetway", "Kati", "Kusini Unguja", -6.17591, 39.39985],
  ["Vuga Road", "Mjini", "Mjini Magharibi", -6.16548, 39.18973],
];

const UNGUJA_REGIONS = new Set(["Kaskazini Unguja", "Kusini Unguja", "Mjini Magharibi"]);

const toArea = ([name, district, region, latitude, longitude]: PlaceRow): ZanzibarArea => ({
  name,
  district,
  region,
  island: UNGUJA_REGIONS.has(region) ? "Unguja" : "Pemba",
  latitude,
  longitude,
});

/**
 * Everything a point may be labelled with: wards first (so the dataset's
 * first row stays stable), then villages, the city and the admin areas.
 * Streets deliberately stay out — see `nearestZanzibarArea`.
 */
const LABELLED_AREAS: ZanzibarArea[] = [...WARD_ROWS, ...PLACE_ROWS, ...ADMIN_ROWS].map(toArea);

/** Every bundled area — `LABELLED_AREAS` plus the searchable street rows. */
export const ZANZIBAR_AREAS: readonly ZanzibarArea[] = [
  ...LABELLED_AREAS,
  ...STREET_ROWS.map(toArea),
];

/** How far a fix may sit from the nearest settlement or admin centroid and still get a label. */
const MAX_AREA_RADIUS_KM = 15;

export interface NearestZanzibarArea {
  area: ZanzibarArea;
  distanceKm: number;
}

/** Anything carrying a possibly-missing coordinate pair. */
export interface Point {
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Closest settlement or admin area to a point, with the great-circle
 * distance that was used to pick it. Streets are skipped — street coverage
 * is too patchy for a stable label. `null` when the point is unusable —
 * never throws, so it is safe to call straight from a render.
 */
export function nearestZanzibarArea(point: Point): NearestZanzibarArea | null {
  const latitude = point.latitude;
  const longitude = point.longitude;
  if (typeof latitude !== "number" || !Number.isFinite(latitude)) return null;
  if (typeof longitude !== "number" || !Number.isFinite(longitude)) return null;

  const origin = { latitude, longitude };
  let best: ZanzibarArea | null = null;
  let bestKm = Number.POSITIVE_INFINITY;
  for (const area of LABELLED_AREAS) {
    const km = haversineKm(origin, area);
    if (km !== null && km < bestKm) {
      best = area;
      bestKm = km;
    }
  }
  return best ? { area: best, distanceKm: bestKm } : null;
}

/**
 * "Nungwi" for a point inside Zanzibar, `null` outside it.
 *
 * The 15 km cap is what keeps Dar es Salaam or the open Indian Ocean from
 * being labelled as a Zanzibar area — settlement centroids are dense enough
 * that any land point on Unguja or Pemba is well inside it.
 */
export function nearestAreaName(point: Point, withinKm: number = MAX_AREA_RADIUS_KM): string | null {
  const nearest = nearestZanzibarArea(point);
  if (!nearest || nearest.distanceKm > withinKm) return null;
  return nearest.area.name;
}

/** Google Maps link for an area — same URL shape as the Directions button. */
export function areaMapsUrl(area: ZanzibarArea): string {
  return (
    directionsUrl({ latitude: area.latitude, longitude: area.longitude }) ??
    `https://www.google.com/maps?q=${area.latitude},${area.longitude}`
  );
}

/**
 * Alternate names the row table has no exact row for. Stone Town now carries
 * its own row, so the aliases only bridge the city's other spellings —
 * "Zanzibar City" shares no token with "Stone Town" and would otherwise
 * return nothing.
 */
const AREA_ALIASES: Record<string, string> = {
  "zanzibar city": "stone town",
  "mji mkongwe": "stone town",
};

/**
 * Forward lookup behind the "type an area" half of the location picker.
 *
 * Purely local: the typed string is matched against the bundled place,
 * district and region names — wards, villages, admin areas and streets —
 * so nothing leaves the browser — no geocoding key, no CSP
 * change, no network round-trip. A hit always carries that row's real WGS84
 * pair, which is what makes a typed answer exactly as trustworthy as a fix
 * the doctor captured with the GPS button.
 *
 * Scoring, highest first: 100 exact place name, 90 place-name prefix, 85 exact
 * district/region, 80 place-name substring, 70 district/region substring, then
 * a +5 bonus when the query starts with the place name. Every space-separated
 * token has to appear somewhere in the row, so "nungwi kaskazini" and
 * "chake chake" narrow down while "asdfgh" returns nothing. Ties break
 * alphabetically, so the list a doctor sees is stable between renders.
 */
export function searchZanzibarAreas(query: string, limit: number = 8): ZanzibarArea[] {
  const normalized = normalizeAreaQuery(query);
  const key = AREA_ALIASES[normalized] ?? normalized;
  if (key.length < 2) return [];
  const tokens = key.split(" ").filter((token) => token.length >= 2);
  if (tokens.length === 0) return [];

  const hits: { area: ZanzibarArea; score: number }[] = [];
  for (const area of ZANZIBAR_AREAS) {
    const name = normalizeAreaQuery(area.name);
    const district = normalizeAreaQuery(area.district);
    const region = normalizeAreaQuery(area.region);
    const island = area.island.toLowerCase();
    const everyToken = tokens.every(
      (token) =>
        name.includes(token) ||
        district.includes(token) ||
        region.includes(token) ||
        island.includes(token)
    );
    if (!everyToken) continue;

    let score = 60;
    if (name === key) score = 100;
    else if (name.startsWith(key)) score = 90;
    else if (district === key || region === key) score = 85;
    else if (name.includes(key)) score = 80;
    else if (district.includes(key) || region.includes(key)) score = 70;
    if (name.startsWith(tokens[0])) score += 5;

    hits.push({ area, score });
  }

  hits.sort(
    (a, b) =>
      b.score - a.score ||
      a.area.name.localeCompare(b.area.name) ||
      a.area.district.localeCompare(b.area.district)
  );
  return hits.slice(0, limit).map((hit) => hit.area);
}

/** Lower-case, apostrophe-free, single-spaced — the shape both sides match on. */
function normalizeAreaQuery(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
