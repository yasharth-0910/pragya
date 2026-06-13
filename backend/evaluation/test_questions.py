"""Ground-truth QA set for the RAGAS retrieval comparison (CLAUDE.md §10).

30 questions authored directly from the 6 core Infovance documents in the test
corpus. Every question is answerable from the document text — no invented facts —
because RAGAS faithfulness / context-precision are only meaningful when the
ground truth is actually present in the corpus the retriever searches.

Coverage (>= 4 questions per source document, plus genuine cross-document):
  hr            -> HR_Leave_Policy_2025
  it_security   -> IT_Security_Policy_2025
  it_helpdesk   -> IT_Helpdesk_SOP
  finance       -> Finance_Expense_Reimbursement_Policy
  engineering   -> Engineering_Team_Handbook
  onboarding    -> Employee_Onboarding_Guide
  cross_document -> answer requires combining two of the above

Each item: id, question, ground_truth, source_doc, category.
"""

QUESTIONS: list[dict] = [
    # ── HR — HR_Leave_Policy_2025 (5) ────────────────────────────────────────
    {
        "id": 1,
        "question": "How many casual leaves are employees entitled to per year?",
        "ground_truth": "Employees are entitled to 12 days of Casual Leave per leave year. Unused Casual Leave lapses at the end of the year and is neither carried forward nor encashed.",
        "source_doc": "HR_Leave_Policy_2025",
        "category": "hr",
    },
    {
        "id": 2,
        "question": "What is the maximum amount of Earned Leave that can be carried forward into the next leave year?",
        "ground_truth": "A maximum of 45 days of Earned Leave may be carried forward into the next leave year; any balance above 45 days lapses unless it has been encashed.",
        "source_doc": "HR_Leave_Policy_2025",
        "category": "hr",
    },
    {
        "id": 3,
        "question": "How many weeks of maternity leave is a woman employee entitled to for her first two children, and how much of it can be taken before delivery?",
        "ground_truth": "A woman employee is entitled to 26 weeks of paid Maternity Leave for the first two surviving children, of which not more than 8 weeks may be taken before the expected date of delivery.",
        "source_doc": "HR_Leave_Policy_2025",
        "category": "hr",
    },
    {
        "id": 4,
        "question": "When is a medical certificate required for sick leave, and by when must it be submitted?",
        "ground_truth": "For any sickness absence of three or more continuous days, a medical certificate from a registered medical practitioner must be submitted to HR within three working days of returning to work.",
        "source_doc": "HR_Leave_Policy_2025",
        "category": "hr",
    },
    {
        "id": 5,
        "question": "After how many continuous working days of unauthorised absence without intimation can it be treated as abandonment of service?",
        "ground_truth": "Unauthorised absence of more than 8 continuous working days without intimation may be treated as abandonment of service under the Company's service rules.",
        "source_doc": "HR_Leave_Policy_2025",
        "category": "hr",
    },

    # ── IT Security — IT_Security_Policy_2025 (4) ────────────────────────────
    {
        "id": 6,
        "question": "What is the minimum password length, and how often must passwords be rotated?",
        "ground_truth": "Passwords must be a minimum of 12 characters and must be rotated every 90 days; the system prompts at day 83 and enforces at day 90.",
        "source_doc": "IT_Security_Policy_2025",
        "category": "it_security",
    },
    {
        "id": 7,
        "question": "After how many consecutive failed login attempts is an account locked?",
        "ground_truth": "Accounts are locked after five consecutive failed login attempts, and can be unlocked via self-service or by raising a ticket with the IT Helpdesk.",
        "source_doc": "IT_Security_Policy_2025",
        "category": "it_security",
    },
    {
        "id": 8,
        "question": "After how long are idle VPN sessions automatically disconnected?",
        "ground_truth": "Idle VPN sessions are automatically disconnected after 30 minutes of inactivity.",
        "source_doc": "IT_Security_Policy_2025",
        "category": "it_security",
    },
    {
        "id": 9,
        "question": "Within how many hours must a security incident be reported, and to whom?",
        "ground_truth": "All suspected or confirmed security incidents must be reported to security@infovance.com within 2 hours of discovery; for critical incidents, also call the Security Operations hotline at extension 4000.",
        "source_doc": "IT_Security_Policy_2025",
        "category": "it_security",
    },

    # ── IT Helpdesk — IT_Helpdesk_SOP (4) ────────────────────────────────────
    {
        "id": 10,
        "question": "What are the two approved channels for raising an IT support ticket?",
        "ground_truth": "The two approved channels are email to helpdesk@infovance.com (which creates a ticket automatically) and the Jira Service Desk self-service portal at servicedesk.infovance.com. Direct personal messages to IT staff are not tracked.",
        "source_doc": "IT_Helpdesk_SOP",
        "category": "it_helpdesk",
    },
    {
        "id": 11,
        "question": "What is the first-response target for a P1 critical priority ticket?",
        "ground_truth": "A P1 - Critical ticket has a first-response target of 1 hour. P1 incidents also trigger immediate notification to the IT Manager (and the Information Security team where security is involved).",
        "source_doc": "IT_Helpdesk_SOP",
        "category": "it_helpdesk",
    },
    {
        "id": 12,
        "question": "Which approved tool does IT use for remote support sessions?",
        "ground_truth": "Remote support is provided using the approved tool TeamViewer. The user shares their TeamViewer ID and session passcode only with a verified Helpdesk engineer on an active ticket, retains control, and the session ends when they close TeamViewer.",
        "source_doc": "IT_Helpdesk_SOP",
        "category": "it_helpdesk",
    },
    {
        "id": 13,
        "question": "If the VPN is not working, what priority should the ticket be and what is its response target?",
        "ground_truth": "VPN not working is a P2 - High priority issue (significant impact with no workaround), which has a first-response target of 4 hours.",
        "source_doc": "IT_Helpdesk_SOP",
        "category": "it_helpdesk",
    },

    # ── Finance — Finance_Expense_Reimbursement_Policy (5) ───────────────────
    {
        "id": 14,
        "question": "What is the daily meal expense limit during business travel?",
        "ground_truth": "The meal limit is INR 800 per day during business travel or while on client-site deputation.",
        "source_doc": "Finance_Expense_Reimbursement_Policy",
        "category": "finance",
    },
    {
        "id": 15,
        "question": "Who is the approving authority for an expense claim above INR 50,000?",
        "ground_truth": "Expense claims above INR 50,000 require approval from the Chief Financial Officer (CFO). Claims up to INR 10,000 are approved by the Reporting Manager and INR 10,001 to 50,000 by the Department Head.",
        "source_doc": "Finance_Expense_Reimbursement_Policy",
        "category": "finance",
    },
    {
        "id": 16,
        "question": "How soon are approved reimbursements paid after final approval?",
        "ground_truth": "Approved reimbursements are paid to the employee's registered bank account within 7 working days of final approval, through the next available payment run, separately from salary.",
        "source_doc": "Finance_Expense_Reimbursement_Policy",
        "category": "finance",
    },
    {
        "id": 17,
        "question": "What is the daily limit for outstation accommodation in metro cities?",
        "ground_truth": "Outstation accommodation in metro cities is capped at INR 3,000 per day, inclusive of taxes.",
        "source_doc": "Finance_Expense_Reimbursement_Policy",
        "category": "finance",
    },
    {
        "id": 18,
        "question": "After returning from a trip taken on a travel advance, by when must the actual expense claim be submitted, and what happens if the advance is not settled within 30 days?",
        "ground_truth": "Within 15 days of returning, the employee must submit the actual expense claim with bills to settle the advance; any unspent balance must be refunded. Failure to settle an advance within 30 days may result in recovery from salary.",
        "source_doc": "Finance_Expense_Reimbursement_Policy",
        "category": "finance",
    },

    # ── Engineering — Engineering_Team_Handbook (4) ─────────────────────────
    {
        "id": 19,
        "question": "How many approvals does a pull request need before it can merge to a protected branch?",
        "ground_truth": "A pull request requires a minimum of two approvals, including at least one from a senior engineer or the discipline lead.",
        "source_doc": "Engineering_Team_Handbook",
        "category": "engineering",
    },
    {
        "id": 20,
        "question": "What is the code coverage threshold enforced as a CI quality gate?",
        "ground_truth": "Code coverage must be greater than 80%, enforced as a CI quality gate; builds that fail to meet the coverage or security gates are blocked from promotion.",
        "source_doc": "Engineering_Team_Handbook",
        "category": "engineering",
    },
    {
        "id": 21,
        "question": "How long is a sprint for the engineering squads?",
        "ground_truth": "Squads operate on two-week sprints using Scrum.",
        "source_doc": "Engineering_Team_Handbook",
        "category": "engineering",
    },
    {
        "id": 22,
        "question": "Which tool manages the on-call rotation, and how long is each on-call cycle?",
        "ground_truth": "The on-call rotation is managed in PagerDuty, with engineers serving two-week on-call cycles with a primary and a secondary responder.",
        "source_doc": "Engineering_Team_Handbook",
        "category": "engineering",
    },

    # ── Onboarding — Employee_Onboarding_Guide (4) ──────────────────────────
    {
        "id": 23,
        "question": "How long is the probation period for new employees?",
        "ground_truth": "New employees serve a probation period of six months from the date of joining, with a mid-probation check-in at the three-month mark. It may be extended once by up to three months.",
        "source_doc": "Employee_Onboarding_Guide",
        "category": "onboarding",
    },
    {
        "id": 24,
        "question": "What is the group health insurance floater cover amount for a new employee?",
        "ground_truth": "The Group Health Insurance provides a floater cover of INR 5,00,000 covering the employee, their spouse and up to two children, with cashless treatment at network hospitals.",
        "source_doc": "Employee_Onboarding_Guide",
        "category": "onboarding",
    },
    {
        "id": 25,
        "question": "After how many years of continuous service does gratuity become payable?",
        "ground_truth": "Gratuity is payable as per the Payment of Gratuity Act, 1972, on completion of five years of continuous service.",
        "source_doc": "Employee_Onboarding_Guide",
        "category": "onboarding",
    },
    {
        "id": 26,
        "question": "By when must weekly timesheets be approved, and through which portal?",
        "ground_truth": "Timesheets are submitted weekly through the InfoPeople portal and must be approved by the manager by 12:00 noon every Monday for the previous week.",
        "source_doc": "Employee_Onboarding_Guide",
        "category": "onboarding",
    },

    # ── Cross-document (4) — each pairs a fact that lives in only ONE doc, so
    #    the answer genuinely requires retrieving from TWO different documents.
    {
        "id": 27,
        "question": "How many consecutive failed login attempts will lock an account, and if an employee is locked out and cannot self-serve, what ticket priority should they raise with the IT Helpdesk?",
        "ground_truth": "Accounts are locked after five consecutive failed login attempts (per the Information Security Policy). If an employee is locked out and cannot self-serve, they should raise a P2 ticket (or call the Helpdesk line), as set out in the IT Helpdesk SOP.",
        "source_doc": "IT_Security_Policy_2025 + IT_Helpdesk_SOP",
        "category": "cross_document",
    },
    {
        "id": 28,
        "question": "If an engineer is rostered for on-call or production support during a gazetted holiday, what compensation do they receive, and which tool manages the on-call rotation?",
        "ground_truth": "Engineering and IT personnel rostered for production support or on-call duty during a gazetted holiday are granted compensatory off, to be availed within 30 days, subject to manager approval (per the HR Leave Policy). The on-call rotation itself is managed in PagerDuty on two-week cycles (per the Engineering Team Handbook).",
        "source_doc": "HR_Leave_Policy_2025 + Engineering_Team_Handbook",
        "category": "cross_document",
    },
    {
        "id": 29,
        "question": "What group health insurance floater cover does a new employee receive, and what is the daily meal limit allowed during business travel?",
        "ground_truth": "A new employee receives a Group Health Insurance floater cover of INR 5,00,000 (per the Employee Onboarding Guide). The daily meal limit during business travel is INR 800 per day (per the Expense Reimbursement Policy).",
        "source_doc": "Employee_Onboarding_Guide + Finance_Expense_Reimbursement_Policy",
        "category": "cross_document",
    },
    {
        "id": 30,
        "question": "How long is the probation period for a new employee, and under the security policy how often must they rotate their password?",
        "ground_truth": "A new employee serves a probation period of six months from the date of joining (per the Employee Onboarding Guide). Under the Information Security Policy, passwords must be rotated every 90 days.",
        "source_doc": "Employee_Onboarding_Guide + IT_Security_Policy_2025",
        "category": "cross_document",
    },
]
