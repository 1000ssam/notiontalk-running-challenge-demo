// 전화번호 정규화 + 국가 감지
//
// 입력 예시:
//   '+81-70-1234-5678'   → { to: '7012345678', country: '81' }   해외(일본)
//   '0081 90 1234 5678'  → { to: '9012345678', country: '81' }   해외(일본, 국제 prefix)
//   '010-1234-5678'      → { to: '01012345678', country: null }  국내
//   '+82-10-1234-5678'   → { to: '01012345678', country: null }  국내(+82 표기)
//
// 미상 패턴은 한국으로 fallback (현 동작 보존).
// Solapi 해외 발송: country는 '+' 없이 숫자 문자열, to는 국가코드 제외 잔여 번호.

const OVERSEAS_COUNTRY_CODES = ['81', '1', '852', '886', '65', '84', '66', '60'];

export function parsePhone(raw) {
  let digits = String(raw ?? '').replace(/[^0-9]/g, '');
  if (!digits) return { to: '', country: null };

  // 국제 prefix '00' 제거 (예: 0081 → 81)
  if (digits.startsWith('00')) digits = digits.slice(2);

  // 국내 mobile prefix
  if (/^01[016-9]/.test(digits)) return { to: digits, country: null };

  // +82 표기로 적힌 한국 번호 → mobile 0 복원
  if (digits.startsWith('82')) return { to: '0' + digits.slice(2), country: null };

  // 등록된 해외 국가코드
  for (const cc of OVERSEAS_COUNTRY_CODES) {
    if (digits.startsWith(cc)) return { to: digits.slice(cc.length), country: cc };
  }

  // 미상 → 한국으로 fallback
  return { to: digits, country: null };
}
