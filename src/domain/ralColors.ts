export interface RalColor {
  code: string
  name: string
  hex: string
}

export const RAL_CLASSIC_COLORS: RalColor[] = [
  { code: 'RAL 1001', name: 'beige', hex: '#D0B084' },
  { code: 'RAL 1003', name: ' signalgelb', hex: '#F9A900' },
  { code: 'RAL 1004', name: 'goldgelb', hex: '#E49E00' },
  { code: 'RAL 1013', name: 'perlweiß', hex: '#E3D9C6' },
  { code: 'RAL 1014', name: 'elfenbein', hex: '#DDC49A' },
  { code: 'RAL 1015', name: 'hellelfenbein', hex: '#E6D2B5' },
  { code: 'RAL 1019', name: 'graubeige', hex: '#A48F7A' },
  { code: 'RAL 2004', name: 'reinorange', hex: '#F44611' },
  { code: 'RAL 3000', name: 'feuerrot', hex: '#A72920' },
  { code: 'RAL 3003', name: 'rubinrot', hex: '#861A22' },
  { code: 'RAL 5002', name: 'ultramarinblau', hex: '#20214F' },
  { code: 'RAL 5003', name: 'saphirblau', hex: '#1D1E2E' },
  { code: 'RAL 5010', name: 'enzianblau', hex: '#0E294B' },
  { code: 'RAL 5012', name: 'lichtblau', hex: '#2188B4' },
  { code: 'RAL 6005', name: 'moosgrün', hex: '#0F4336' },
  { code: 'RAL 6009', name: 'tannengrün', hex: '#27352A' },
  { code: 'RAL 6011', name: 'resedagrün', hex: '#68825A' },
  { code: 'RAL 7016', name: 'anthrazitgrau', hex: '#383E42' },
  { code: 'RAL 7021', name: 'schwarzgrau', hex: '#2F3234' },
  { code: 'RAL 7032', name: 'kieselgrau', hex: '#B8B799' },
  { code: 'RAL 7035', name: 'lichtgrau', hex: '#CBD0CC' },
  { code: 'RAL 7040', name: 'fenstergrau', hex: '#9DA3A6' },
  { code: 'RAL 7044', name: 'seidengrau', hex: '#BDBDB2' },
  { code: 'RAL 8017', name: 'schokoladenbraun', hex: '#45322E' },
  { code: 'RAL 9001', name: 'cremeweiß', hex: '#FDF4E3' },
  { code: 'RAL 9002', name: 'grauweiß', hex: '#D7D5CB' },
  { code: 'RAL 9003', name: 'signalweiß', hex: '#F4F4F4' },
  { code: 'RAL 9005', name: 'tiefschwarz', hex: '#0A0A0D' },
  { code: 'RAL 9010', name: 'reinweiß', hex: '#F1ECE1' },
  { code: 'RAL 9016', name: 'verkehrsweiß', hex: '#F1F0EA' },
]

const MASONRY_RAL_CODES = [
  'RAL 1001',
  'RAL 1013',
  'RAL 1014',
  'RAL 1015',
  'RAL 1019',
  'RAL 7032',
  'RAL 7035',
  'RAL 7044',
  'RAL 9001',
  'RAL 9002',
  'RAL 9010',
  'RAL 9016',
]

export const RAL_MASONRY_COLORS = RAL_CLASSIC_COLORS.filter(({ code }) => MASONRY_RAL_CODES.includes(code))
