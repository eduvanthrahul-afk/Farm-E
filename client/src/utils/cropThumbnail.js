const cropArtwork = [
  { keys: ['tomato'], src: '/images/crops/tomato.svg' },
  { keys: ['onion'], src: '/images/crops/onion.svg' },
  { keys: ['mango'], src: '/images/crops/mango.svg' },
];

export const cropThumbnail = (cropName = '') => {
  const normalized = String(cropName).toLocaleLowerCase();
  return cropArtwork.find(({ keys }) => keys.some((key) => normalized.includes(key)))?.src || '/images/crops/harvest.svg';
};
