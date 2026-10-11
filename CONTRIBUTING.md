# 🤝 Contributing to Cachetify

Thank you for your interest in contributing to Cachetify! We welcome contributions from the community and appreciate your effort to improve our project.

## 📋 Table of Contents

- [Code of Conduct](#-code-of-conduct)
- [Getting Started](#-getting-started)
- [Development Workflow](#-development-workflow)
- [Coding Standards](#-coding-standards)
- [Commit Guidelines](#-commit-guidelines)
- [Pull Request Process](#-pull-request-process)
- [Testing](#-testing)
- [Documentation](#-documentation)

---

## 🚦 Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inspiring community for all. We pledge to:

- **Be respectful** - Treat all contributors with kindness and professionalism
- **Be inclusive** - Welcome contributors of all backgrounds and experience levels
- **Be collaborative** - Work together to achieve common goals
- **Be constructive** - Provide feedback that helps others improve

### Unacceptable Behavior

The following behaviors are not tolerated:
- Harassment, discrimination, or offensive language
- Personal attacks or insulting comments
- Unwelcome sexual attention or advances
- Doxxing or privacy violations
- Spam or low-effort contributions

**Reporting:** Contact [conduct@cachetify.com](mailto:conduct@cachetify.com) with details.

---

## 🚀 Getting Started

### Prerequisites

Ensure you have:
- Node.js 20+
- npm 10+ (official package manager for all sub-projects)
- PostgreSQL 14+
- Redis (optional, for caching)
- Git
- A GitHub account

### Fork & Clone

```bash
# 1. Fork the repository on GitHub
# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/cachetify.git
cd cachetify

# 3. Add upstream remote
git remote add upstream https://github.com/ORIGINAL_OWNER/cachetify.git

# 4. Create a feature branch
git checkout -b feature/your-feature-name
```

### Setup Development Environment

```bash
# Install dependencies
npm install

# Backend setup
cd backend
npm install
npx prisma migrate dev
npx prisma generate

# Frontend setup
cd ../frontend
npm install

# Create .env files (copy from .env.example)
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

> ⚠️ **Never commit `.env` or `.env.local`** — they're already gitignored. Fill them with your own local/testnet values. Production secrets live in Vercel's and Render's dashboards, not in the repo — see the [Deployment section of the README](./README.md#-deployment).

### Start Development

```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

---

## 🔄 Development Workflow

### 1. Choose a Task

- Browse [Issues](https://github.com/yourusername/cachetify/issues)
- Look for labels: `good-first-issue`, `help-wanted`, `bug`
- Comment on the issue to claim it

### 2. Create a Feature Branch

```bash
# Update main branch
git fetch upstream
git checkout main
git merge upstream/main

# Create feature branch (use descriptive names)
git checkout -b feature/add-contract-templates
git checkout -b fix/wallet-funding-bug
git checkout -b docs/update-api-docs
```

### 3. Make Changes

- Write clean, focused code
- Keep commits atomic and logical
- Run tests frequently
- Update related documentation

### 4. Push & Create PR

```bash
# Push to your fork
git push origin feature/your-feature-name

# Create Pull Request on GitHub
# Fill in the PR template completely
```

---

## 📝 Coding Standards

### JavaScript/Node.js

```javascript
// ✅ Good
const getUserWallet = async (userId) => {
    if (!userId) {
        throw new Error('User ID is required');
    }
    
    const wallet = await prisma.userWallet.findUnique({
        where: { userId },
    });
    
    return wallet;
};

// ❌ Bad
const getWallet = async (id) => {
    var wallet = await db.wallet.get(id);
    return wallet;
};
```

### Style Guide

- **Naming:** camelCase for variables/functions, PascalCase for classes/types
- **Formatting:** 4 spaces indentation, 100 char line length
- **Comments:** Use JSDoc for functions, explain "why" not "what"
- **Errors:** Always throw descriptive errors
- **Async:** Use async/await over callbacks

### TypeScript

```typescript
// ✅ Good - Full types
interface UserWallet {
    id: string;
    userId: string;
    publicAddress: string;
    balance: BigNumber;
}

const getUserWallet = async (userId: string): Promise<UserWallet> => {
    // implementation
};

// ❌ Bad - No types
const getUserWallet = (userId) => {
    // implementation
};
```

### Error Handling

```javascript
// ✅ Good
try {
    const wallet = await walletService.getBalance(address);
    return { wallet, status: 'ok' };
} catch (error) {
    logger.error('Failed to get wallet balance:', error);
    throw new Error(`Wallet service error: ${error.message}`);
}

// ❌ Bad
const wallet = walletService.getBalance(address);
return wallet;
```

### Logging

```javascript
// ✅ Good
logger.info(`User ${userId} created wallet: ${wallet.address}`);
logger.warn(`Low gas balance for wallet ${address}: ${balance} MATIC`);
logger.error('Failed to sign contract:', error, { contractId, userId });

// ❌ Bad
console.log('ok');
console.log(wallet);
```

---

## 📌 Commit Guidelines

### Commit Message Format

Use semantic commit messages:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat:** New feature
- **fix:** Bug fix
- **docs:** Documentation changes
- **style:** Code style (no logic change)
- **refactor:** Code refactoring
- **test:** Adding/updating tests
- **chore:** Maintenance, dependencies

### Examples

```bash
# Feature
git commit -m "feat(wallet): add on-demand funding system

- Implement ensureFunded middleware
- Add fundOnDemandService with dynamic amounts
- Update contract routes to auto-fund wallets"

# Bug fix
git commit -m "fix(auth): resolve Privy token validation

Fixes #123 - Token was not properly validated during
Privy authentication flow. Added explicit token
verification in authService.

Fixes: #123"

# Documentation
git commit -m "docs(api): update fund endpoints documentation"

# Refactoring
git commit -m "refactor(services): consolidate wallet utilities

No functional changes - improves code organization
and reduces duplication."
```

### Commit Best Practices

- ✅ Keep commits focused and atomic
- ✅ Use imperative mood ("add feature" not "added feature")
- ✅ Reference issues: "Fixes #123" or "Related to #456"
- ✅ Write descriptive bodies for complex changes
- ✅ Limit first line to 50 characters

---

## 🔀 Pull Request Process

### Before Submitting

1. **Update your branch**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run tests & lint**
   ```bash
   npm test
   npm run lint
   ```

3. **Build to check for errors**
   ```bash
   npm run build
   ```

### PR Template

```markdown
## 📝 Description
Brief description of changes

## 🔗 Related Issues
Fixes #123
Related to #456

## 🧪 Testing
- [ ] Tested locally
- [ ] Added/updated tests
- [ ] All tests pass

## ✅ Checklist
- [ ] Code follows style guide
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No console.log() statements
- [ ] No hardcoded values

## 📸 Screenshots (if applicable)
Include screenshots for UI changes
```

### Review Process

1. **Automated Checks**
   - Tests must pass
   - Linting must pass
   - No merge conflicts

2. **Code Review**
   - Maintainers review code quality
   - At least 1 approval required
   - Constructive feedback provided

3. **Approval & Merge**
   - Once approved, PR is merged
   - Branch is deleted
   - Contributor is thanked!

---

## 🧪 Testing

### Running Tests

```bash
# Backend
cd backend
npm test

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch

# Frontend
cd frontend
npm test
npm run test:coverage
```

### Writing Tests

```javascript
// ✅ Good test
describe('fundOnDemandService', () => {
    it('should fund wallet when balance is insufficient', async () => {
        const userId = 'test-user-123';
        const requiredAmount = ethers.parseEther('0.05');
        
        const result = await fundOnDemandService.ensureBalance(userId, requiredAmount);
        
        expect(result.wasFunded).toBe(true);
        expect(result.address).toBeDefined();
    });
    
    it('should not fund when balance is sufficient', async () => {
        // Mock balance > required
        const result = await fundOnDemandService.ensureBalance(userId, amount);
        expect(result.wasFunded).toBe(false);
    });
});
```

### Test Coverage

- Aim for **80%+ coverage** on critical code
- Test edge cases and error scenarios
- Mock external dependencies (blockchain, DB)
- Use descriptive test names

---

## 📚 Documentation

### Code Comments

```javascript
/**
 * Ensures user wallet has sufficient balance for blockchain action
 * 
 * @param {string} userId - User identifier
 * @param {BigNumberish} requiredAmount - Amount needed in wei
 * @returns {Promise<Object>} Funding result with address and status
 * @throws {Error} If wallet not found or funding fails
 * 
 * @example
 * const result = await fundOnDemandService.ensureBalance(userId, '0.05');
 * if (result.wasFunded) console.log('Wallet funded!');
 */
async ensureBalance(userId, requiredAmount) {
    // implementation
}
```

### README Updates

Update relevant READMEs if your changes:
- Add new features
- Change API endpoints
- Modify configuration
- Affect setup process

### API Documentation

Update [backend/docs/](./backend/docs/) if adding/modifying endpoints:
- Document all parameters
- Include request/response examples
- Note any authentication requirements

---

## 🎯 Development Tips

### Useful Commands

```bash
# Format code
npm run format

# Lint code
npm run lint:fix

# Type check
npm run type-check

# Database commands
npx prisma studio          # View database UI
npx prisma migrate status  # Check migrations
npx prisma generate       # Generate Prisma client
```

### Debugging

```javascript
// Add logging
logger.debug('Variable value:', value);

// Breakpoints in VS Code
// Set breakpoint in .vscode/launch.json

// Chrome DevTools for frontend
// Open http://localhost:3000 in browser
```

### Common Issues

**Port already in use:**
```bash
# Find process using port 5000
lsof -i :5000
kill -9 <PID>
```

**Database connection issues:**
```bash
# Check PostgreSQL is running
psql -U postgres

# Reset database
npx prisma migrate reset
```

---

## 🏆 Recognition

Contributors are recognized in:
- [CONTRIBUTORS.md](./CONTRIBUTORS.md)
- GitHub repository contributors page
- Release notes for significant contributions

---

## 📞 Contact & Questions

- 📧 **Email:** dev@cachetify.com
- 💬 **Discussions:** [GitHub Discussions](https://github.com/yourusername/cachetify/discussions)
- 🐛 **Issues:** [GitHub Issues](https://github.com/yourusername/cachetify/issues)

---

## 📜 License

By contributing to Cachetify, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to Cachetify! Together, we're building the future of blockchain contract management.** 🚀
