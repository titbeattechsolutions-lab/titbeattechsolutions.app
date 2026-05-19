export type ENote = { title: string; content: string; topics: string[] };

export const E_NOTES: Record<string, Record<string, ENote[]>> = {
  "Early Years": {
    "Numeracy": [
      { title: "Counting Numbers 1-10", content: "Introduction to counting numbers from 1 to 10 using objects and visual aids.", topics: ["Number recognition", "Counting objects", "Number sequence"] },
      { title: "Basic Addition", content: "Simple addition using objects and fingers. Understanding the concept of 'more'.", topics: ["Addition concept", "Using objects", "Simple sums"] },
      { title: "Shapes and Patterns", content: "Identifying basic shapes (circle, square, triangle) and creating patterns.", topics: ["Shape recognition", "Pattern making", "Colors"] },
    ],
    "Literacy": [
      { title: "Alphabet Recognition", content: "Learning letters A-Z through songs, rhymes, and visual aids.", topics: ["Letter names", "Letter sounds", "Alphabet order"] },
      { title: "Phonics Basics", content: "Introduction to letter sounds and blending simple words.", topics: ["Letter sounds", "Word blending", "Simple words"] },
      { title: "Picture Reading", content: "Using pictures to tell stories and develop comprehension.", topics: ["Picture interpretation", "Storytelling", "Vocabulary"] },
    ],
    "Health Habits": [
      { title: "Personal Hygiene", content: "Importance of washing hands, brushing teeth, and keeping clean.", topics: ["Hand washing", "Dental care", "Body cleanliness"] },
      { title: "Healthy Eating", content: "Understanding healthy foods vs. unhealthy foods.", topics: ["Food groups", "Healthy choices", "Water importance"] },
    ],
  },
  "Lower Primary": {
    "Mathematics": [
      { title: "Place Value", content: "Understanding tens and ones, numbers up to 100.", topics: ["Tens and ones", "Number writing", "Counting by 10s"] },
      { title: "Addition and Subtraction", content: "Two-digit addition and subtraction with and without regrouping.", topics: ["Column addition", "Borrowing", "Word problems"] },
      { title: "Multiplication Basics", content: "Introduction to multiplication as repeated addition.", topics: ["Times tables 2-5", "Repeated addition", "Arrays"] },
    ],
    "English Studies": [
      { title: "Sentence Construction", content: "Building simple sentences with correct punctuation.", topics: ["Subject and predicate", "Capitalization", "Full stops"] },
      { title: "Reading Comprehension", content: "Reading short passages and answering questions.", topics: ["Main idea", "Details", "Inference"] },
      { title: "Creative Writing", content: "Writing short paragraphs on given topics.", topics: ["Paragraph structure", "Descriptive words", "Story elements"] },
    ],
    "Basic Science & Tech": [
      { title: "Living and Non-Living Things", content: "Distinguishing between living and non-living things.", topics: ["Characteristics of life", "Classification", "Examples"] },
      { title: "Plants and Animals", content: "Basic needs of plants and animals, their habitats.", topics: ["Plant parts", "Animal homes", "Food chains"] },
    ],
  },
  "Upper Primary": {
    "Mathematics": [
      { title: "Fractions", content: "Understanding proper and improper fractions, equivalent fractions.", topics: ["Numerator/denominator", "Equivalent fractions", "Simplifying"] },
      { title: "Decimals", content: "Introduction to decimal numbers and operations.", topics: ["Decimal place value", "Addition/subtraction", "Money"] },
      { title: "Geometry", content: "Area and perimeter of shapes, angles.", topics: ["Area formulas", "Perimeter", "Angle types"] },
    ],
    "English Studies": [
      { title: "Parts of Speech", content: "Nouns, verbs, adjectives, adverbs in context.", topics: ["Nouns", "Verbs", "Adjectives", "Adverbs"] },
      { title: "Essay Writing", content: "Structure of narrative, descriptive, and argumentative essays.", topics: ["Essay types", "Paragraphs", "Introduction/Conclusion"] },
      { title: "Poetry Analysis", content: "Understanding rhyme, rhythm, and poetic devices.", topics: ["Rhyme scheme", "Metaphor", "Simile"] },
    ],
    "Basic Science": [
      { title: "The Human Body", content: "Major systems: digestive, respiratory, circulatory.", topics: ["Body systems", "Organs", "Functions"] },
      { title: "Matter", content: "States of matter, properties, and changes.", topics: ["Solid, liquid, gas", "Properties", "Changes of state"] },
    ],
  },
  "Junior Secondary": {
    "Mathematics": [
      { title: "Algebraic Expressions", content: "Simplifying expressions, solving linear equations.", topics: ["Variables", "Like terms", "Equation solving"] },
      { title: "Geometry", content: "Angles, triangles, quadrilaterals, circles.", topics: ["Angle properties", "Triangle types", "Circle theorems"] },
      { title: "Statistics", content: "Mean, median, mode, range, data representation.", topics: ["Averages", "Charts", "Data analysis"] },
    ],
    "English Language": [
      { title: "Comprehension", content: "Advanced reading passages with critical thinking questions.", topics: ["Inference", "Main idea", "Vocabulary"] },
      { title: "Grammar", content: "Tenses, subject-verb agreement, active/passive voice.", topics: ["Verb tenses", "Agreement", "Voice"] },
      { title: "Literature", content: "Introduction to literary terms and analysis.", topics: ["Literary devices", "Themes", "Character analysis"] },
    ],
    "Basic Science": [
      { title: "Cells and Organization", content: "Plant and animal cells, tissues, organs.", topics: ["Cell structure", "Cell types", "Organization"] },
      { title: "Energy", content: "Forms of energy, energy transformations.", topics: ["Kinetic energy", "Potential energy", "Conservation"] },
    ],
  },
  "Senior Secondary": {
    "Mathematics": [
      { title: "Calculus Basics", content: "Differentiation and integration fundamentals.", topics: ["Derivatives", "Integrals", "Applications"] },
      { title: "Trigonometry", content: "Trigonometric functions, identities, equations.", topics: ["Sin, cos, tan", "Identities", "Equations"] },
      { title: "Probability", content: "Basic probability, permutations, combinations.", topics: ["Probability rules", "Permutations", "Combinations"] },
    ],
    "English Language": [
      { title: "Advanced Essay Writing", content: "Argumentative and expository essays.", topics: ["Thesis statements", "Evidence", "Counterarguments"] },
      { title: "Summary Writing", content: "Techniques for summarizing passages.", topics: ["Main points", "Conciseness", "Paraphrasing"] },
      { title: "Lexis and Structure", content: "Advanced vocabulary and sentence structures.", topics: ["Word formation", "Collocations", "Syntax"] },
    ],
    "Biology": [
      { title: "Cell Biology", content: "Cell structure, functions, and processes.", topics: ["Cell organelles", "Cell division", "Transport"] },
      { title: "Ecology", content: "Ecosystems, food chains, ecological relationships.", topics: ["Ecosystem components", "Energy flow", "Population dynamics"] },
      { title: "Genetics", content: "Mendelian inheritance, DNA, variation.", topics: ["Genes", "Inheritance patterns", "DNA structure"] },
    ],
  },
};
