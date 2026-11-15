import {existsSync} from 'node:fs';

// The shared source tree ships a tiny neutral sample dataset and this marker.
// The private deployment repository carries the real kitchen data instead.
export const SAMPLE_DATA_MARKER='.kitchen-sample-data';
export const usingSampleData=()=>existsSync(new URL('../'+SAMPLE_DATA_MARKER,import.meta.url));

// Checks that assert facts about the real recipe/pantry dataset call this first.
export function requireKitchenDataset(name){
  if(!usingSampleData())return;
  console.log(`SKIP ${name}: needs the private kitchen dataset`);
  process.exit(0);
}

// Production must be built from the private deployment repository: the live
// site serves its real recipe/pantry seed files, which the sample must never replace.
export function assertProductionDataset(releaseContext,sample=usingSampleData()){
  if(releaseContext==='production'&&sample){
    throw new Error(`Sample dataset (${SAMPLE_DATA_MARKER}) cannot be deployed to production; deploy from the private repository.`);
  }
  return true;
}
