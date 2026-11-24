// k=v exact match, k~regex. OSM tagging is volunteer-maintained, so coverage varies by country and category.
export interface CategoryDef { label: string; osm: string[]; fsq: string }
export const CATEGORIES: Record<string, CategoryDef> = {
  restaurants: { label: 'Restaurants', osm: ['amenity=restaurant'], fsq: 'restaurant' },
  hotels: { label: 'Hotels', osm: ['tourism=hotel', 'tourism=guest_house', 'tourism=hostel'], fsq: 'hotel' },
  barbershops: { label: 'Barbershops', osm: ['shop=hairdresser'], fsq: 'barbershop' },
  beauty_salons: { label: 'Beauty salons', osm: ['shop=beauty'], fsq: 'beauty salon' },
  hospitals: { label: 'Hospitals', osm: ['amenity=hospital'], fsq: 'hospital' },
  clinics: { label: 'Clinics', osm: ['amenity=clinic', 'amenity=doctors'], fsq: 'medical clinic' },
  dental: { label: 'Dental practices', osm: ['amenity=dentist'], fsq: 'dentist' },
  law_firms: { label: 'Law firms', osm: ['office=lawyer'], fsq: 'law firm' },
  real_estate: { label: 'Real estate agencies', osm: ['office=estate_agent'], fsq: 'real estate agency' },
  construction: { label: 'Construction companies', osm: ['office=construction_company'], fsq: 'construction company' },
  schools: { label: 'Schools', osm: ['amenity=school'], fsq: 'school' },
  gyms: { label: 'Gyms', osm: ['leisure=fitness_centre'], fsq: 'gym' },
  fitness_studios: { label: 'Fitness studios', osm: ['sport=yoga', 'sport=pilates'], fsq: 'fitness studio' },
  automotive: { label: 'Automotive businesses', osm: ['shop=car_repair', 'shop=car', 'amenity=car_wash'], fsq: 'auto repair' },
  retail: { label: 'Retail shops', osm: ['shop~^(gift|general|variety_store|department_store|electronics|furniture)$'], fsq: 'retail store' },
  fashion: { label: 'Fashion stores', osm: ['shop=clothes', 'shop=shoes', 'shop=boutique'], fsq: 'clothing store' },
  supermarkets: { label: 'Supermarkets', osm: ['shop=supermarket'], fsq: 'supermarket' },
  travel_agencies: { label: 'Travel agencies', osm: ['shop=travel_agency', 'office=travel_agent'], fsq: 'travel agency' },
  events: { label: 'Event businesses', osm: ['shop=party', 'craft=caterer'], fsq: 'event space' },
  professional: { label: 'Professional services', osm: ['office=accountant', 'office=consulting', 'office=tax_advisor'], fsq: 'professional service' },
  technology: { label: 'Technology businesses', osm: ['office=it'], fsq: 'technology company' },
  financial: { label: 'Financial services', osm: ['amenity=bank', 'office=financial', 'office=insurance'], fsq: 'financial service' },
};
/** Unknown category strings are treated as free-text keywords. */
export function splitCategories(input: string[]) {
  const known: string[] = []; const custom: string[] = [];
  for (const c of input) (CATEGORIES[c] ? known : custom).push(c);
  return { known, custom };
}
