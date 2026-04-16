export const transferSchema = {
  source_account_id: { required: true, type: 'string', uuid: true },
  dest_account_id: { required: true, type: 'string', uuid: true },
  amount: { required: true, type: 'number', gt: 0 },
  idempotency_key: { required: true, type: 'string' },
};

export const depositSchema = {
  account_id: { required: true, type: 'string', uuid: true },
  amount: { required: true, type: 'number', gt: 0 },
  idempotency_key: { required: true, type: 'string' },
};

export const withdrawalSchema = {
  account_id: { required: true, type: 'string', uuid: true },
  amount: { required: true, type: 'number', gt: 0 },
  idempotency_key: { required: true, type: 'string' },
};
