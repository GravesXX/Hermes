import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { homedir } from 'os';
import { join } from 'path';

const dbPath = join(homedir(), '.hermes', 'hermes.db');
const db = new Database(dbPath);

const id = uuidv4();
const now = new Date().toISOString();
const title = "Senior Associate Engineer - AI Full Stack Developer";
const company = "ZS";
const rawText = `ZS Engineering Lab is seeking highly skilled professionals to design, develop, and deliver sophisticated technical solutions, including products, applications, reporting systems, and data-driven platforms. This role emphasizes deep technical expertise, rigorous problem-solving, and mastery of engineering practices across cloud, data, and ML/AI domains.

Sr. Associate Engineer – AI Full Stack Developer

Location: Toronto, Canada | Salary: $110,000 - $125,000 | Category: Technology / Engineering Labs

The Sr. Associate Engineer will support the design, deployment, and scaling of Large Language Model (LLM)-based solutions in a Pharma R&D environment. This role sits at the intersection of AI Engineering, Data Science, and Business stakeholders, partnering with Research, IT, and Digital teams to build production-grade AI applications that drive scientific value. The ideal candidate combines strong software engineering skills with experience in machine learning/LLM systems and thrives in a client-facing, regulated enterprise environment.

What you'll do:

LLM Application Engineering & POC Development:
- Partner with Data Scientists, Scientific SMEs, and IT stakeholders to design and develop LLM-enabled POCs for Research use cases (e.g., literature mining, target assessment, study insights).
- Translate scientific and business requirements into scalable AI application architectures.
- Design and implement retrieval-augmented generation (RAG) pipelines.
- Optimize LLM performance for large datasets and complex domain queries.
- Ensure enterprise-grade scalability, security, and performance of deployed applications.
- Drive transition from prototype to production-ready systems.

Production Support:
- Provide Tier 1–3 support for LLM-based applications in production.
- Monitor system performance and proactively identify issues.
- Perform root cause analysis for recurring issues and implement preventive measures.
- Collaborate across engineering, cloud, and security teams to resolve complex technical challenges.
- Maintain detailed technical documentation, support runbooks, and knowledge artifacts.
- Ensure adherence to enterprise data security, privacy, and regulatory standards (GxP, 21 CFR Part 11 awareness preferred).

Automated Testing & DevOps Enablement:
- Design and implement automated testing frameworks for LLM-based systems.
- Build unit, integration, and end-to-end test suites (including LLM evaluation testing).
- Develop evaluation frameworks for: Hallucination detection, Output consistency, Prompt robustness, Latency & performance benchmarking.
- Integrate automated testing into CI/CD pipelines.
- Contribute to DevSecOps best practices in a regulated environment.

Cloud & Architecture Engineering:
- Develop and deploy applications on AWS (EC2, S3, RDS, ECS, etc.).
- Implement containerized deployments (Docker, ECS).
- Design optimized database architectures (Postgres, Elasticsearch, Redshift).
- Support secure API development and enterprise integration patterns.
- Collaborate with enterprise architecture and cybersecurity teams.

Client-Facing & Cross-Functional Collaboration:
- Engage directly with Pharma Data Science, Research, and IT stakeholders.
- Lead technical working sessions and whiteboarding discussions.
- Present solution architectures and trade-offs to business audiences.
- Contribute to roadmap planning and technical design documentation.
- Balance rapid innovation with governance, compliance, and change management requirements.

What you'll bring:

Education: Bachelor's degree in Computer Science, Engineering, Data Science, or related field.

Technical Skills:
Core Engineering: Proficiency in Python (required), SQL; experience with R or JavaScript a plus. Experience building web applications (Streamlit, Shiny, React, Vue, etc.). Strong understanding of REST APIs and microservices architecture. Experience with CI/CD pipelines and Agile SDLC practices.
Cloud & Infrastructure: Hands-on experience with AWS (EC2, S3, RDS required; ECS preferred). Experience with Docker and container orchestration. Experience with relational and NoSQL databases. Understanding of distributed system design principles.
Machine Learning & LLMs: Experience with ML frameworks (PyTorch, TensorFlow, scikit-learn). Experience working with Large Language Models in production settings. Experience implementing RAG pipelines and vector databases preferred. Experience with testing frameworks (pytest, Selenium, JUnit).

Experience:
- 4+ years of experience in software engineering, ML engineering, or AI application development.
- Experience supporting enterprise applications in production environments.
- Agentic AI & Orchestration experience preferred.
- Pharma R&D Domain experience preferred.
- Strong problem-solving and analytical mindset.
- Ability to understand underlying scientific questions and translate them into technical solutions.
- Strong communication and presentation skills (technical and non-technical audiences).
- Experience working in cross-functional teams (Data Science, IT, Business).
- Client-first mentality. Intense work ethic. Collaborative spirit.`;

db.prepare(
  'INSERT INTO job_descriptions (id, title, company, raw_text, requirements, seniority_level, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
).run(id, title, company, rawText, null, null, now);

console.log(JSON.stringify({ id, title, company, created_at: now }));
db.close();
