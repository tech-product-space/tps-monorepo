const { QuizQuestion, UserQuestion, UserAnswer, UserScore, UserQuizEntry } = require('../models');

const startQuiz = async (req, res) => {
    const { userId, name, email, category } = req.body;

    try {
        const existing = await UserQuizEntry.findAll({ where: { user_id: userId, category } });

        if (existing.length > 0) {
            const anyAnswered = existing.some(q => q.status === 'answered');
            return res.status(200).json({
                isDataStored: anyAnswered ? "Already Stored" : "Freshly Stored"
            });
        }

        const allQuestions = await QuizQuestion.findAll({ where: { category } });

        if (allQuestions.length === 0) {
            return res.status(400).json({
                message: 'No questions found for this category',
                isDataStored: "Failed"
            });
        }

        const shuffled = allQuestions.sort(() => 0.5 - Math.random());

        const selectedQuestions = shuffled.slice(0, 25);

        const userQuestions = selectedQuestions.map(q => ({
            user_id: userId,
            question_id: q.id,
            question: q.question,
            correct_answer: q.answer,
            category,
            sub_category: q.subCategory,
            email,
            name,
            status: 'unanswered',
            is_correct: false,
            score: 0,
            is_completed: false
        }));

        await UserQuizEntry.bulkCreate(userQuestions);

        res.status(201).json({ isDataStored: "Freshly Stored" });

    } catch (error) {
        console.error('🔥 Start quiz error:', error);
        res.status(500).json({ message: 'Server error', isDataStored: "Failed" });
    }
};

const getQuiz = async (req, res) => {
    const { userId, category } = req.params;

    // const catg = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();

    try {
        const userQuestions = await UserQuizEntry.findAll({
            where: { user_id: userId, category },
            include: [
                {
                    model: QuizQuestion,
                    as: 'quizQuestion',
                    attributes: ['id', 'question', 'options', 'answer', 'hasImage', 'imageUrl'],
                },
            ],
        });

        res.json({ questions: userQuestions });
    } catch (error) {
        console.error('Fetch quiz error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const submitAnswer = async (req, res) => {
    const { userId, questionId, selectedAnswer, category } = req.body;

    try {
        const question = await QuizQuestion.findByPk(questionId);
        if (!question) return res.status(404).json({ message: 'Question not found' });

        const isCorrect = selectedAnswer === question.answer;

        await UserQuizEntry.update(
            {
                status: 'answered',
                selected_answer: selectedAnswer,
                is_correct: isCorrect,
                score: isCorrect ? 1 : 0,
                is_completed: true,
            },
            {
                where: {
                    user_id: userId,
                    question_id: questionId,
                    category
                }
            }
        );

        res.status(200).json({ message: 'Answer saved', isCorrect });
    } catch (error) {
        console.error('Answer error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


const completeQuiz = async (req, res) => {
    const { userId, category } = req.body;

    try {
        await UserQuizEntry.update(
            { is_completed: true },
            { where: { user_id: userId, category, is_completed: false } }
        );

        res.status(201).json({ message: 'Quiz completed' });
    } catch (error) {
        console.error('Complete error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const isQuizCompleted = async (req, res) => {
    const { email, category } = req.params;

    try {
        // Find all entries for that user and category
        const quizEntries = await UserQuizEntry.findAll({
            where: {
                email,
                category
            }
        });

        // If there are no entries, quiz has not started
        if (quizEntries.length === 0) {
            return res.status(200).json({ isQuizCompleted: false });
        }

        // Check if any entry is incomplete
        const hasIncomplete = quizEntries.some(entry => entry.is_completed === false);

        return res.status(200).json({ isQuizCompleted: !hasIncomplete });

    } catch (error) {
        console.error('Check quiz completion error:', error);
        res.status(500).json({ message: 'Server error', isQuizCompleted: false });
    }
};


const getResultByEmail = async (req, res) => {
    try {
        const { email, category } = req.params;

        const entries = await UserQuizEntry.findAll({
            where: {
                email,
                category,
                is_completed: true,
            },
        });

        if (entries.length === 0) {
            return res.json({
                isEmailAvailable: false,
                message: "No quiz data found",
            });
        }

        const totalScoreRaw = entries.reduce((sum, entry) => sum + (entry.score || 0), 0);
        const totalPossibleScore = 25; // 5 subcategories × 5 questions each
        const totalScore = (totalScoreRaw / totalPossibleScore) * 100;

        const scoresBySubCategoryRaw = {};
        for (const entry of entries) {
            const subCat = entry.sub_category || "Uncategorized";
            scoresBySubCategoryRaw[subCat] = (scoresBySubCategoryRaw[subCat] || 0) + (entry.score || 0);
        }

        const scoresBySubCategory = {};
        const maxPerSubCategory = 5; // 5 questions per subcategory
        for (const [subCat, score] of Object.entries(scoresBySubCategoryRaw)) {
            scoresBySubCategory[subCat] = (score / maxPerSubCategory) * 100;
        }

        return res.json({
            isEmailAvailable: true,
            email,
            category,
            totalScore: Math.round(totalScore), // Rounded to nearest whole number
            scoresBySubCategory: Object.fromEntries(
                Object.entries(scoresBySubCategory).map(([k, v]) => [k, Math.round(v)])
            ),
        });
    } catch (error) {
        console.error("Error fetching result:", error);
        res.status(500).json({ message: "Something went wrong" });
    }
};


module.exports = { startQuiz, getQuiz, submitAnswer, completeQuiz, isQuizCompleted, getResultByEmail };
