export const testUsers = {
  owner: {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'owner@example.test',
    role: 'owner',
  },
  admin: {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'admin@example.test',
    role: 'admin',
  },
  member: {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'member@example.test',
    role: 'member',
  },
} as const;

export type TestUserKey = keyof typeof testUsers;
