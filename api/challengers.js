import { listChallengers } from '../lib/notion.js';

export default async function handler(req, res) {
  try {
    const list = await listChallengers();
    res.status(200).json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
