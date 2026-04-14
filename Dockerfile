FROM node:24-slim

WORKDIR /app

# Install ZooGent locally (agents can resolve zoogent/client and @anthropic-ai/sdk)
RUN echo '{"name":"zoogent-app","private":true,"type":"module","dependencies":{"zoogent":"*","@anthropic-ai/sdk":"*"}}' > package.json && npm install

# Create data directory (volume mount point)
RUN mkdir -p /app/data

ENV DATABASE_URL=./data/zoogent.db
ENV PORT=3200
ENV SKILLS_DIR=./data/skills
ENV NODE_ENV=production

EXPOSE 3200

# Init (creates DB, seeds system skills) + Start
CMD ["sh", "-c", "npx zoogent init && npx zoogent start"]
