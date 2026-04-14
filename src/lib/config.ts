export const config = {
  dataDir: process.env.DATA_DIR || './data',
  port: parseInt(process.env.PORT || '3200'),
  skillsDir: process.env.SKILLS_DIR || './data/skills',
};
