import * as path from "path";

type FrameworkMatch = {
  framework: string;
  confidence: number;
};

type DetectorRule = {
  name: string;
  check: (files: Record<string, string | undefined>) => FrameworkMatch | null;
};

function hasDep(deps: Record<string, string> | undefined, name: string): boolean {
  if (!deps) return false;
  return name in deps;
}

const FRAMEWORK_RULES: DetectorRule[] = [
  // Node.js / JavaScript frameworks
  {
    name: "Next.js",
    check: (files) => {
      const pkg = safeParse(files["package.json"]);
      if (!pkg) return null;
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (hasDep(deps, "next")) return { framework: "Next.js", confidence: 1.0 };
      return null;
    },
  },
  {
    name: "React",
    check: (files) => {
      const pkg = safeParse(files["package.json"]);
      if (!pkg) return null;
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (hasDep(deps, "next")) return { framework: "Next.js", confidence: 1.0 };
      if (hasDep(deps, "react") || hasDep(deps, "react-dom"))
        return { framework: "React", confidence: 0.8 };
      return null;
    },
  },
  {
    name: "Vue",
    check: (files) => {
      const pkg = safeParse(files["package.json"]);
      if (!pkg) return null;
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (hasDep(deps, "vue")) {
        if (hasDep(deps, "nuxt") || hasDep(deps, "nuxt3"))
          return { framework: "Nuxt", confidence: 1.0 };
        return { framework: "Vue", confidence: 0.8 };
      }
      if (files["nuxt.config.ts"] || files["nuxt.config.js"])
        return { framework: "Nuxt", confidence: 1.0 };
      return null;
    },
  },
  {
    name: "Svelte",
    check: (files) => {
      const pkg = safeParse(files["package.json"]);
      if (!pkg) return null;
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (hasDep(deps, "svelte")) {
        if (hasDep(deps, "svelte-kit") || hasDep(deps, "@sveltejs/kit"))
          return { framework: "SvelteKit", confidence: 1.0 };
        if (files["svelte.config.js"] || files["svelte.config.ts"])
          return { framework: "SvelteKit", confidence: 0.9 };
        return { framework: "Svelte", confidence: 0.8 };
      }
      return null;
    },
  },
  {
    name: "Angular",
    check: (files) => {
      const pkg = safeParse(files["package.json"]);
      if (!pkg) return null;
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (hasDep(deps, "@angular/core")) return { framework: "Angular", confidence: 0.9 };
      if (files["angular.json"]) return { framework: "Angular", confidence: 0.8 };
      return null;
    },
  },
  {
    name: "Express",
    check: (files) => {
      const pkg = safeParse(files["package.json"]);
      if (!pkg) return null;
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (hasDep(deps, "express")) return { framework: "Express", confidence: 0.7 };
      return null;
    },
  },
  {
    name: "NestJS",
    check: (files) => {
      const pkg = safeParse(files["package.json"]);
      if (!pkg) return null;
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (hasDep(deps, "@nestjs/core")) return { framework: "NestJS", confidence: 0.9 };
      return null;
    },
  },
  {
    name: "Astro",
    check: (files) => {
      const pkg = safeParse(files["package.json"]);
      if (!pkg) return null;
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (hasDep(deps, "astro")) return { framework: "Astro", confidence: 0.9 };
      return null;
    },
  },
  {
    name: "Remix",
    check: (files) => {
      const pkg = safeParse(files["package.json"]);
      if (!pkg) return null;
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (hasDep(deps, "@remix-run/react") || hasDep(deps, "@remix-run/node"))
        return { framework: "Remix", confidence: 0.9 };
      return null;
    },
  },
  {
    name: "Gatsby",
    check: (files) => {
      const pkg = safeParse(files["package.json"]);
      if (!pkg) return null;
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (hasDep(deps, "gatsby")) return { framework: "Gatsby", confidence: 0.9 };
      return null;
    },
  },
  // Python frameworks
  {
    name: "Django",
    check: (files) => {
      const pkg = safeParse(files["pyproject.toml"] || files["Pipfile"] || files["requirements.txt"]);
      if (typeof pkg === "object" && pkg !== null) {
        const all = JSON.stringify(pkg).toLowerCase();
        if (all.includes("django")) return { framework: "Django", confidence: 0.8 };
      }
      if (files["manage.py"]) return { framework: "Django", confidence: 0.9 };
      if (files["settings.py"] && files["urls.py"]) return { framework: "Django", confidence: 0.7 };
      return null;
    },
  },
  {
    name: "FastAPI",
    check: (files) => {
      const pkg = safeParse(files["pyproject.toml"] || files["Pipfile"] || files["requirements.txt"]);
      if (typeof pkg === "object" && pkg !== null) {
        const all = JSON.stringify(pkg).toLowerCase();
        if (all.includes("fastapi")) return { framework: "FastAPI", confidence: 0.8 };
      }
      return null;
    },
  },
  {
    name: "Flask",
    check: (files) => {
      const pkg = safeParse(files["pyproject.toml"] || files["Pipfile"] || files["requirements.txt"]);
      if (typeof pkg === "object" && pkg !== null) {
        const all = JSON.stringify(pkg).toLowerCase();
        if (all.includes("flask")) return { framework: "Flask", confidence: 0.8 };
      }
      return null;
    },
  },
  // Go frameworks
  {
    name: "Gin",
    check: (files) => {
      const mod = files["go.mod"];
      if (mod && mod.includes("github.com/gin-gonic/gin"))
        return { framework: "Gin", confidence: 0.8 };
      return null;
    },
  },
  {
    name: "Echo",
    check: (files) => {
      const mod = files["go.mod"];
      if (mod && mod.includes("github.com/labstack/echo"))
        return { framework: "Echo", confidence: 0.8 };
      return null;
    },
  },
  {
    name: "Fiber",
    check: (files) => {
      const mod = files["go.mod"];
      if (mod && mod.includes("github.com/gofiber/fiber"))
        return { framework: "Fiber", confidence: 0.8 };
      return null;
    },
  },
  // Rust frameworks
  {
    name: "Axum",
    check: (files) => {
      const cargo = files["Cargo.toml"];
      if (cargo && cargo.includes("axum")) return { framework: "Axum", confidence: 0.8 };
      return null;
    },
  },
  {
    name: "Actix",
    check: (files) => {
      const cargo = files["Cargo.toml"];
      if (cargo && cargo.includes("actix-web")) return { framework: "Actix", confidence: 0.8 };
      return null;
    },
  },
  {
    name: "Rocket",
    check: (files) => {
      const cargo = files["Cargo.toml"];
      if (cargo && cargo.includes("rocket")) return { framework: "Rocket", confidence: 0.8 };
      return null;
    },
  },
  // Ruby frameworks
  {
    name: "Rails",
    check: (files) => {
      const gemfile = files["Gemfile"];
      if (gemfile && gemfile.includes("rails")) return { framework: "Rails", confidence: 0.9 };
      if (files["config/routes.rb"] || files["app/controllers/application_controller.rb"])
        return { framework: "Rails", confidence: 0.8 };
      return null;
    },
  },
  {
    name: "Sinatra",
    check: (files) => {
      const gemfile = files["Gemfile"];
      if (gemfile && gemfile.includes("sinatra")) return { framework: "Sinatra", confidence: 0.8 };
      return null;
    },
  },
  // PHP frameworks
  {
    name: "Laravel",
    check: (files) => {
      const composer = files["composer.json"];
      if (composer) {
        const parsed = safeParse(composer);
        if (parsed && hasDep(parsed.require, "laravel/framework"))
          return { framework: "Laravel", confidence: 0.9 };
      }
      if (files["artisan"]) return { framework: "Laravel", confidence: 0.9 };
      return null;
    },
  },
  {
    name: "Symfony",
    check: (files) => {
      const composer = files["composer.json"];
      if (composer) {
        const parsed = safeParse(composer);
        if (parsed && hasDep(parsed.require, "symfony/framework-bundle"))
          return { framework: "Symfony", confidence: 0.9 };
      }
      return null;
    },
  },
  // C# frameworks
  {
    name: "ASP.NET",
    check: (files) => {
      const csprojFiles = Object.keys(files).filter((f) => f.endsWith(".csproj"));
      for (const f of csprojFiles) {
        const content = files[f];
        if (content && (content.includes("Microsoft.AspNetCore") || content.includes("Microsoft.NET.Sdk.Web")))
          return { framework: "ASP.NET Core", confidence: 0.9 };
      }
      return null;
    },
  },
  // Java frameworks
  {
    name: "Spring Boot",
    check: (files) => {
      const pom = files["pom.xml"];
      if (pom && pom.includes("spring-boot")) return { framework: "Spring Boot", confidence: 0.9 };
      const gradle = files["build.gradle"];
      if (gradle && gradle.includes("spring-boot")) return { framework: "Spring Boot", confidence: 0.9 };
      return null;
    },
  },
];

function safeParse(content: string | undefined): Record<string, unknown> | null {
  if (!content) return null;
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function detectFramework(files: Record<string, string | undefined>): {
  framework?: string;
  confidence?: number;
} {
  for (const rule of FRAMEWORK_RULES) {
    const result = rule.check(files);
    if (result) {
      return { framework: result.framework, confidence: result.confidence };
    }
  }
  return {};
}

export function detectAllFrameworks(
  files: Record<string, string | undefined>
): { framework: string; confidence: number }[] {
  const results: { framework: string; confidence: number }[] = [];
  for (const rule of FRAMEWORK_RULES) {
    const result = rule.check(files);
    if (result) {
      results.push(result);
    }
  }
  return results.sort((a, b) => b.confidence - a.confidence);
}
