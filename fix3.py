import sys

with open('src/components/PlanScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the Heart icon for the Swip selection card
target1 = '''<div className="w-14 h-14 bg-gradient-to-br from-pink-100 to-rose-100 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Heart className="w-6 h-6 text-rose-500" />
                  </div>'''

target1_replace = '''<div className="w-14 h-14 bg-gradient-to-br from-yellow-100 to-amber-100 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" />
                  </div>'''

content = content.replace(target1, target1_replace)

# Replace the heart icon on the Start Swip button
target2 = '''<Heart className="w-5 h-5" />
                {language === 'IT' ? 'Inizia lo Swip!' : 'Start Swip!'}'''

target2_replace = '''<Star className="w-5 h-5 fill-white" />
                {language === 'IT' ? 'Inizia lo Swip!' : 'Start Swip!'}'''

content = content.replace(target2, target2_replace)

with open('src/components/PlanScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("PlanScreen Star Icon fixed")
