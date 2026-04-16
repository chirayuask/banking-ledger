export const createAccountSchema = {
  name: { required: true, type: 'string' },
  account_number: { required: true, type: 'string' },
  ifsc_code: { required: true, type: 'string' },
  initial_balance: { required: true, type: 'number', gte: 0 },
};
