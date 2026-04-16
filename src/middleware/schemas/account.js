export const createAccountSchema = {
  name: { required: true, type: 'string' },
  initial_balance: { required: true, type: 'number', gte: 0 },
};
