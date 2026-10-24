// Catchword's world: 33 regions, each a group of real countries (by their
// names in the Natural Earth map), with what matters for a new word:
//
//   pop      people, in millions
//   lang     language family: a word crosses into another family slowly
//   net      how online it is (0–1): group chats and memes travel here
//   young    how young it is (0–1): schoolyards and playgrounds
//   formal   how formal its speech is (0–1): slang struggles, Purists thrive
//   wealth   0–1: how much the Purists' research draws on it
//   air      has an airport anyone flies to; port: ships call
//   land     neighbours a word can walk to

export const REGIONS = [
  { id: 'usa', name: 'United States', countries: ['United States of America'], pop: 335, lang: 'en', net: 0.92, young: 0.45, formal: 0.45, wealth: 0.95, air: true, port: true, land: ['canada', 'mexico'] },
  { id: 'canada', name: 'Canada', countries: ['Canada', 'Greenland'], pop: 40, lang: 'en', net: 0.94, young: 0.4, formal: 0.5, wealth: 0.9, air: true, port: true, land: ['usa'] },
  { id: 'mexico', name: 'Mexico', countries: ['Mexico'], pop: 130, lang: 'latin', net: 0.75, young: 0.6, formal: 0.4, wealth: 0.55, air: true, port: true, land: ['usa', 'caribbean'] },
  { id: 'caribbean', name: 'Central America & the Caribbean', countries: ['Guatemala', 'Belize', 'Honduras', 'El Salvador', 'Nicaragua', 'Costa Rica', 'Panama', 'Cuba', 'Jamaica', 'Haiti', 'Dominican Rep.', 'Puerto Rico', 'Bahamas', 'Trinidad and Tobago'], pop: 85, lang: 'latin', net: 0.6, young: 0.65, formal: 0.35, wealth: 0.35, air: true, port: true, land: ['mexico', 'andes'] },
  { id: 'andes', name: 'The Andes', countries: ['Colombia', 'Venezuela', 'Ecuador', 'Peru', 'Bolivia'], pop: 140, lang: 'latin', net: 0.7, young: 0.62, formal: 0.4, wealth: 0.4, air: true, port: true, land: ['caribbean', 'brazil', 'cone'] },
  { id: 'brazil', name: 'Brazil', countries: ['Brazil', 'Guyana', 'Suriname'], pop: 220, lang: 'latin', net: 0.8, young: 0.6, formal: 0.35, wealth: 0.5, air: true, port: true, land: ['andes', 'cone'] },
  { id: 'cone', name: 'The Southern Cone', countries: ['Argentina', 'Chile', 'Uruguay', 'Paraguay', 'Falkland Is.'], pop: 75, lang: 'latin', net: 0.85, young: 0.5, formal: 0.45, wealth: 0.6, air: true, port: true, land: ['brazil', 'andes'] },
  { id: 'uk', name: 'Britain & Ireland', countries: ['United Kingdom', 'Ireland'], pop: 73, lang: 'en', net: 0.96, young: 0.4, formal: 0.7, wealth: 0.9, air: true, port: true, land: [] },
  { id: 'france', name: 'France & the Low Alps', countries: ['France', 'Belgium', 'Luxembourg', 'Switzerland'], pop: 90, lang: 'latin', net: 0.92, young: 0.4, formal: 0.85, wealth: 0.9, air: true, port: true, land: ['iberia', 'germany', 'italy'] },
  { id: 'iberia', name: 'Iberia', countries: ['Spain', 'Portugal'], pop: 58, lang: 'latin', net: 0.92, young: 0.4, formal: 0.55, wealth: 0.8, air: true, port: true, land: ['france'] },
  { id: 'germany', name: 'Germany & the Low Countries', countries: ['Germany', 'Austria', 'Netherlands', 'Denmark', 'Czechia'], pop: 145, lang: 'germanic', net: 0.93, young: 0.38, formal: 0.7, wealth: 0.92, air: true, port: true, land: ['france', 'eastern', 'nordic', 'italy'] },
  { id: 'nordic', name: 'The Nordics', countries: ['Norway', 'Sweden', 'Finland', 'Iceland'], pop: 28, lang: 'germanic', net: 0.97, young: 0.4, formal: 0.5, wealth: 0.95, air: true, port: true, land: ['germany', 'russia'] },
  { id: 'italy', name: 'Italy & the Balkans', countries: ['Italy', 'Slovenia', 'Croatia', 'Bosnia and Herz.', 'Serbia', 'Montenegro', 'Kosovo', 'Albania', 'Macedonia', 'Greece', 'Cyprus', 'N. Cyprus'], pop: 100, lang: 'latin', net: 0.85, young: 0.38, formal: 0.6, wealth: 0.7, air: true, port: true, land: ['france', 'germany', 'eastern', 'turkey'] },
  { id: 'eastern', name: 'Eastern Europe', countries: ['Poland', 'Slovakia', 'Hungary', 'Romania', 'Bulgaria', 'Moldova', 'Ukraine', 'Belarus', 'Lithuania', 'Latvia', 'Estonia'], pop: 135, lang: 'slavic', net: 0.82, young: 0.42, formal: 0.55, wealth: 0.55, air: true, port: true, land: ['germany', 'italy', 'russia', 'turkey'] },
  { id: 'russia', name: 'Russia', countries: ['Russia'], pop: 145, lang: 'slavic', net: 0.85, young: 0.4, formal: 0.6, wealth: 0.55, air: true, port: true, land: ['eastern', 'nordic', 'centralasia', 'china'] },
  { id: 'turkey', name: 'Turkey & the Caucasus', countries: ['Turkey', 'Georgia', 'Armenia', 'Azerbaijan'], pop: 100, lang: 'turkic', net: 0.8, young: 0.55, formal: 0.5, wealth: 0.5, air: true, port: true, land: ['italy', 'eastern', 'mideast', 'persia'] },
  { id: 'mideast', name: 'The Middle East', countries: ['Syria', 'Iraq', 'Israel', 'Palestine', 'Lebanon', 'Jordan', 'Saudi Arabia', 'Yemen', 'Oman', 'United Arab Emirates', 'Qatar', 'Kuwait'], pop: 160, lang: 'arabic', net: 0.8, young: 0.65, formal: 0.65, wealth: 0.7, air: true, port: true, land: ['turkey', 'persia', 'egypt'] },
  { id: 'persia', name: 'Iran & Afghanistan', countries: ['Iran', 'Afghanistan'], pop: 130, lang: 'persian', net: 0.7, young: 0.65, formal: 0.6, wealth: 0.4, air: true, port: true, land: ['mideast', 'turkey', 'centralasia', 'southasia'] },
  { id: 'centralasia', name: 'Central Asia', countries: ['Kazakhstan', 'Uzbekistan', 'Turkmenistan', 'Kyrgyzstan', 'Tajikistan', 'Mongolia'], pop: 85, lang: 'turkic', net: 0.65, young: 0.6, formal: 0.5, wealth: 0.35, air: true, port: false, land: ['russia', 'china', 'persia'] },
  { id: 'egypt', name: 'Egypt & the Nile', countries: ['Egypt', 'Libya', 'Sudan', 'S. Sudan'], pop: 180, lang: 'arabic', net: 0.65, young: 0.65, formal: 0.55, wealth: 0.35, air: true, port: true, land: ['mideast', 'maghreb', 'sahel', 'eastafrica'] },
  { id: 'maghreb', name: 'The Maghreb', countries: ['Morocco', 'W. Sahara', 'Algeria', 'Tunisia', 'Mauritania'], pop: 100, lang: 'arabic', net: 0.7, young: 0.6, formal: 0.55, wealth: 0.35, air: true, port: true, land: ['egypt', 'sahel'] },
  { id: 'sahel', name: 'The Sahel & West Coast', countries: ['Mali', 'Niger', 'Chad', 'Burkina Faso', 'Senegal', 'Gambia', 'Guinea', 'Guinea-Bissau', 'Sierra Leone', 'Liberia', "Côte d'Ivoire"], pop: 200, lang: 'afro', net: 0.35, young: 0.78, formal: 0.4, wealth: 0.15, air: false, port: true, land: ['maghreb', 'westafrica', 'egypt'] },
  { id: 'westafrica', name: 'Nigeria & the Gulf of Guinea', countries: ['Nigeria', 'Ghana', 'Togo', 'Benin', 'Cameroon', 'Central African Rep.'], pop: 300, lang: 'afro', net: 0.45, young: 0.78, formal: 0.4, wealth: 0.2, air: true, port: true, land: ['sahel', 'centralafrica'] },
  { id: 'eastafrica', name: 'East Africa', countries: ['Ethiopia', 'Eritrea', 'Djibouti', 'Somalia', 'Somaliland', 'Kenya', 'Uganda', 'Tanzania', 'Rwanda', 'Burundi'], pop: 380, lang: 'bantu', net: 0.35, young: 0.78, formal: 0.4, wealth: 0.15, air: true, port: true, land: ['egypt', 'centralafrica', 'southafrica'] },
  { id: 'centralafrica', name: 'Central Africa', countries: ['Dem. Rep. Congo', 'Congo', 'Gabon', 'Eq. Guinea', 'Angola', 'Zambia'], pop: 190, lang: 'bantu', net: 0.3, young: 0.8, formal: 0.4, wealth: 0.15, air: false, port: true, land: ['westafrica', 'eastafrica', 'southafrica'] },
  { id: 'southafrica', name: 'Southern Africa', countries: ['South Africa', 'Namibia', 'Botswana', 'Zimbabwe', 'Mozambique', 'Malawi', 'Lesotho', 'eSwatini', 'Madagascar'], pop: 150, lang: 'bantu', net: 0.6, young: 0.65, formal: 0.5, wealth: 0.35, air: true, port: true, land: ['centralafrica', 'eastafrica'] },
  { id: 'southasia', name: 'South Asia', countries: ['India', 'Pakistan', 'Bangladesh', 'Nepal', 'Bhutan', 'Sri Lanka'], pop: 1950, lang: 'indic', net: 0.5, young: 0.6, formal: 0.55, wealth: 0.25, air: true, port: true, land: ['persia', 'china', 'seasia'] },
  { id: 'china', name: 'China & Taiwan', countries: ['China', 'Taiwan'], pop: 1430, lang: 'sinitic', net: 0.75, young: 0.35, formal: 0.7, wealth: 0.55, air: true, port: true, land: ['russia', 'centralasia', 'southasia', 'seasia', 'korea'] },
  { id: 'korea', name: 'Korea', countries: ['South Korea', 'North Korea'], pop: 77, lang: 'korean', net: 0.9, young: 0.38, formal: 0.7, wealth: 0.7, air: true, port: true, land: ['china'] },
  { id: 'japan', name: 'Japan', countries: ['Japan'], pop: 124, lang: 'japanese', net: 0.93, young: 0.3, formal: 0.85, wealth: 0.85, air: true, port: true, land: [] },
  { id: 'seasia', name: 'Mainland Southeast Asia', countries: ['Myanmar', 'Thailand', 'Laos', 'Cambodia', 'Vietnam', 'Malaysia', 'Brunei'], pop: 270, lang: 'sea', net: 0.7, young: 0.55, formal: 0.5, wealth: 0.45, air: true, port: true, land: ['china', 'southasia'] },
  { id: 'islands', name: 'Indonesia & the Pacific Islands', countries: ['Indonesia', 'Philippines', 'Timor-Leste', 'Papua New Guinea', 'Solomon Is.', 'Vanuatu', 'Fiji', 'New Caledonia'], pop: 410, lang: 'malay', net: 0.65, young: 0.6, formal: 0.45, wealth: 0.35, air: true, port: true, land: [] },
  { id: 'oceania', name: 'Australia & New Zealand', countries: ['Australia', 'New Zealand'], pop: 32, lang: 'en', net: 0.93, young: 0.4, formal: 0.45, wealth: 0.9, air: true, port: true, land: [] }
]

export const REGION = Object.fromEntries(REGIONS.map((r) => [r.id, r]))
export const LANG_NAMES = { en: 'English', latin: 'Romance languages', germanic: 'Germanic languages', slavic: 'Slavic languages', arabic: 'Arabic', persian: 'Persian and Pashto', turkic: 'Turkic languages', afro: 'West African languages', bantu: 'Bantu and Cushitic languages', indic: 'Hindi, Urdu and Bengali', sinitic: 'Chinese', korean: 'Korean', japanese: 'Japanese', sea: 'Thai, Vietnamese and Malay', malay: 'Indonesian and Tagalog' }
