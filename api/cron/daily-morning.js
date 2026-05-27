// 매일 아침 08:00 KST 실행되는 Vercel cron
// - 시작일 == 오늘이면 전체 챌린저에게 첫날 SMS
// - 마지막날 == 오늘이면 전체 챌린저에게 마지막날 SMS
// - 그 외엔 연속 2일 이상 휴식한 챌린저에게 독려 SMS (마지막 러닝 후 3일+ 경과)

import {
  getActiveChallengers,
  getChallengeInfo,
  getLastRunDate,
  logMessage,
  hasSuccessfulMessage,
  todayKstDate,
  daysBetweenIsoDate,
} from '../../lib/notion-challenge.js';
import { sendSms } from '../../lib/solapi.js';
import { messages } from '../../lib/messages.js';
import { parsePhone } from '../../lib/phone.js';

export default async function handler(req, res) {
  // Vercel cron은 자동으로 Authorization: Bearer <CRON_SECRET> 첨부
  const auth = req.headers.authorization || '';
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const today = todayKstDate(); // 'YYYY-MM-DD'
  const summary = {
    today,
    challengers: 0,
    encourageSent: 0,
    encourageSkipped: 0,
    encourageFailed: 0,
    lastDayRun: false,
    lastDaySent: 0,
    lastDayFailed: 0,
    firstDayRun: false,
    firstDaySent: 0,
    firstDayFailed: 0,
    errors: [],
  };

  try {
    const challenge = await getChallengeInfo();
    if (!challenge) {
      return res.status(200).json({ ok: true, skipped: 'no challenge info', summary });
    }

    // ── 발송 스위치(노션 제어) ──────────────────────────────
    // 챌린지 정보 페이지의 '발송 상태'가 '진행'이 아니면 아무것도 보내지 않고 종료.
    // 크론 스케줄 자체는 그대로 매일 돌지만, 노션 토글만으로 재배포 없이 on/off.
    // 테스트모드/마지막날/첫날/독려 등 모든 발송 분기가 이 가드 아래에 있다.
    if (!challenge.sendingEnabled) {
      return res.status(200).json({
        ok: true,
        skipped: `발송 중단 상태 (발송 상태=${challenge.sendStatus || '미설정'})`,
        summary,
      });
    }

    const challengers = await getActiveChallengers();
    summary.challengers = challengers.length;

    // ── 테스트 모드: CRON_TEST_NICKNAME 설정 시 ──
    // 해당 닉네임 1명에게만 강제로 독려 메시지 발송. 마지막날 로직 스킵.
    // 검증 후 env 변수 삭제하면 자동으로 일반 모드 복귀.
    const testNickname = process.env.CRON_TEST_NICKNAME;
    if (testNickname) {
      const target = challengers.find((c) => c.name === testNickname);
      if (!target) {
        return res.status(200).json({
          ok: true,
          testMode: true,
          error: `nickname not found among active challengers: ${testNickname}`,
          activeNames: challengers.map((c) => c.name),
        });
      }
      // 테스트 모드도 진짜 daysSince 사용 (임계값만 무시하고 강제 발송)
      const lastRun = await getLastRunDate(target.challengerId);
      const baseline = lastRun || challenge.startDate;
      const daysSince = baseline ? Math.max(daysBetweenIsoDate(baseline, today), 0) : 0;
      const { to, country } = parsePhone(target.phone);
      const msg = await messages.encourage(target.name, daysSince, { overseas: !!country });
      const result = await sendSms({ to, country, ...msg });
      await logMessage({
        challengerId: target.challengerId,
        type: '독려',
        trigger: '크론',
        body: msg.text,
        status: result.ok ? '성공' : '실패',
        messageId: result.messageId,
        errorMessage: result.error
          ? `[TEST MODE] ${result.error}`
          : '[TEST MODE]',
        recipientName: target.name,
      });
      return res.status(200).json({
        ok: true,
        testMode: true,
        target: target.name,
        sent: result.ok,
        error: result.error,
      });
    }

    // ── 1. 마지막날 메시지 ────────────────────────────────
    if (challenge.endDate && today === challenge.endDate) {
      summary.lastDayRun = true;
      for (const c of challengers) {
        try {
          // 챌린저별 마지막날 메시지 중복 방지
          const already = await hasSuccessfulMessage(c.challengerId, '마지막날');
          if (already) continue;

          const { to, country } = parsePhone(c.phone);
          const msg = await messages.lastDay(c.name, challenge.name, { overseas: !!country });
          const result = await sendSms({ to, country, ...msg });
          await logMessage({
            challengerId: c.challengerId,
            type: '마지막날',
            trigger: '크론',
            body: msg.text,
            status: result.ok ? '성공' : '실패',
            messageId: result.messageId,
            errorMessage: result.error,
            recipientName: c.name,
          });
          if (result.ok) summary.lastDaySent += 1;
          else summary.lastDayFailed += 1;
        } catch (e) {
          summary.lastDayFailed += 1;
          summary.errors.push({ challengerId: c.challengerId, type: '마지막날', message: e.message });
        }
      }
    }

    // ── 2. 첫날 메시지 ────────────────────────────────────
    // 시작일 == 오늘이면 참여확정 챌린저 전원에게 1통씩 (멱등)
    if (challenge.startDate && today === challenge.startDate) {
      summary.firstDayRun = true;
      for (const c of challengers) {
        try {
          const already = await hasSuccessfulMessage(c.challengerId, '첫날');
          if (already) continue;

          const { to, country } = parsePhone(c.phone);
          const msg = await messages.firstDay(
            c.name,
            challenge.name,
            challenge.targetCount,
            14,
            { overseas: !!country },
          );
          const result = await sendSms({ to, country, ...msg });
          await logMessage({
            challengerId: c.challengerId,
            type: '첫날',
            trigger: '크론',
            body: msg.text,
            status: result.ok ? '성공' : '실패',
            messageId: result.messageId,
            errorMessage: result.error,
            recipientName: c.name,
          });
          if (result.ok) summary.firstDaySent += 1;
          else summary.firstDayFailed += 1;
        } catch (e) {
          summary.firstDayFailed += 1;
          summary.errors.push({ challengerId: c.challengerId, type: '첫날', message: e.message });
        }
      }
    }

    // ── 3. 독려 메시지 (2일+ 미달성) ──────────────────────
    // 챌린지 시작 전이면 스킵
    const challengeStarted =
      !challenge.startDate || daysBetweenIsoDate(challenge.startDate, today) >= 0;
    if (challengeStarted) {
      // 첫날·마지막날 전용 메시지로 커버되므로 독려는 스킵
      const isLastDay = challenge.endDate && today === challenge.endDate;
      const isFirstDay = challenge.startDate && today === challenge.startDate;
      if (!isLastDay && !isFirstDay) {
        for (const c of challengers) {
          try {
            const lastRun = await getLastRunDate(c.challengerId);
            const baseline = lastRun || challenge.startDate;
            if (!baseline) {
              summary.encourageSkipped += 1;
              continue;
            }
            const daysSince = daysBetweenIsoDate(baseline, today);
            // "연속 2일 휴식 후 아침" 기준:
            //  - lastRun 있는 경우: 마지막 러닝 다음날부터 휴식 카운트.
            //    월 러닝 → 화·수 휴식(2일) → 목 아침 발송. daysSince(월→목)=3.
            //  - lastRun 없는 경우(아직 한 번도 안 뛴 챌린저): 챌린지 시작일 당일부터 휴식 카운트.
            //    5/11 시작(휴식1) → 5/12 휴식2 → 5/13 아침 발송. daysSince(5/11→5/13)=2.
            // 이전엔 두 경우 모두 < 2 였어서 lastRun 있는 사람에게 하루 일찍 발송되던 버그.
            const threshold = lastRun ? 3 : 2;
            if (daysSince < threshold) {
              summary.encourageSkipped += 1;
              continue;
            }

            // 같은 날 중복 발송 방지
            const todayIsoStart = `${today}T00:00:00.000+09:00`;
            const sentToday = await hasSuccessfulMessage(c.challengerId, '독려', {
              afterIso: todayIsoStart,
            });
            if (sentToday) {
              summary.encourageSkipped += 1;
              continue;
            }

            const { to, country } = parsePhone(c.phone);
            const msg = await messages.encourage(c.name, daysSince, { overseas: !!country });
            const result = await sendSms({ to, country, ...msg });
            await logMessage({
              challengerId: c.challengerId,
              type: '독려',
              trigger: '크론',
              body: msg.text,
              status: result.ok ? '성공' : '실패',
              messageId: result.messageId,
              errorMessage: result.error,
              recipientName: c.name,
            });
            if (result.ok) summary.encourageSent += 1;
            else summary.encourageFailed += 1;
          } catch (e) {
            summary.encourageFailed += 1;
            summary.errors.push({
              challengerId: c.challengerId,
              type: '독려',
              message: e.message,
            });
          }
        }
      }
    }

    return res.status(200).json({ ok: true, summary });
  } catch (e) {
    console.error('cron error:', e);
    return res.status(500).json({ error: 'internal error', message: e.message, summary });
  }
}
