export const reversalSchema = {
  transaction_id: { required: true, type: 'string', uuid: true },
  idempotency_key: { required: true, type: 'string' },
};
