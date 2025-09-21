
export const COUNTRIES: { code: string; name: string; language?: string }[] = [
    { code: 'any', name: '전 세계' },
    { code: 'KR', name: '대한민국', language: 'Korean' },
    { code: 'US', name: '미국', language: 'English' },
    { code: 'JP', name: '일본', language: 'Japanese' },
    { code: 'GB', name: '영국', language: 'English' },
    { code: 'DE', name: '독일', language: 'German' },
    { code: 'FR', name: '프랑스', language: 'French' },
    { code: 'IN', name: '인도', language: 'Hindi' },
    { code: 'BR', name: '브라질', language: 'Portuguese' },
    { code: 'RU', name: '러시아', language: 'Russian' },
    { code: 'CA', name: '캐나다', language: 'English' },
    { code: 'AU', name: '호주', language: 'English' },
    { code: 'CN', name: '중국', language: 'Chinese' },
    { code: 'ES', name: '스페인', language: 'Spanish' },
    { code: 'MX', name: '멕시코', language: 'Spanish' },
];

const COUNTRY_NAME_MAP = new Map(COUNTRIES.map(c => [c.code, c.name]));

export const getCountryNameByCode = (code: string): string => {
    return COUNTRY_NAME_MAP.get(code) || code;
};

export const getFlagEmoji = (countryCode: string): string => {
    if (!countryCode || countryCode === 'N/A' || countryCode.length !== 2) {
        return '🌍'; // Globe for unknown/not applicable
    }
    // Formula to convert two-letter country code to regional indicator symbols
    const codePoints = [...countryCode.toUpperCase()].map(char => 0x1F1E6 + char.charCodeAt(0) - 'A'.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
};