import { render,screen } from "@testing-library/react";
import { ContributorRichText } from "../contributor-rich-text";

describe("campaign rich text",()=>{
  it("preserves readable headings, paragraphs and links while removing scripts and event attributes",()=>{
    const {container}=render(<ContributorRichText content={'<h2>Instructions</h2><p onclick="evil()">Read <a href="https://example.com" style="position:fixed" onmouseover="evil()">the guide</a>.</p><script>evil()</script><iframe src="https://example.com"></iframe><!--ckboost-campaign-settings:v1:hidden-->'}/>);
    expect(screen.getByRole("heading",{name:"Instructions"})).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("rel","noopener noreferrer");
    expect(container.querySelector("script,iframe,[onclick],[onmouseover],[style]")).toBeNull();
    expect(container.textContent).not.toContain("settings");
    expect(container.textContent).not.toContain("evil");
  });
  it("discards unsafe links, inline SVG and non-HTTP image sources",()=>{
    const {container}=render(<ContributorRichText content={'<a href="javascript:alert(1)">bad URL</a><img src="data:image/svg+xml,evil"><svg><script>evil()</script></svg><img src="https://example.com/proof.png" onerror="evil()" alt="Proof">'}/>);
    expect(container.querySelector("a,svg,script,[onerror]")).toBeNull();
    expect(screen.getByRole("img",{name:"Proof"})).toHaveAttribute("src","https://example.com/proof.png");
  });
  it("renders Markdown mixed with malicious raw HTML through the same safe allowlist",()=>{
    const {container}=render(<ContributorRichText content={'## Campaign guide\n\n**Required evidence**\n\n- First step\n- [Open guide](https://example.com/guide)\n\n<script>alert(1)</script>\n\n<img src="data:image/svg+xml,evil" onerror="evil()">\n\n[Unsafe link](javascript:alert(1))'}/>);
    expect(screen.getByRole("heading",{name:"Campaign guide"})).toBeInTheDocument();
    expect(container.querySelector("strong")).toHaveTextContent("Required evidence");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link",{name:"Open guide"})).toHaveAttribute("rel","noopener noreferrer");
    expect(container.querySelector("script,img,[onerror],a[href^='javascript:']")).toBeNull();
    expect(container.textContent).not.toContain("alert(1)");
  });
});
